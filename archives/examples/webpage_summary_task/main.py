#!/usr/bin/env python3

import subprocess
import json
import time
import asyncio
import os
import signal
import ipaddress
from urllib.parse import urlparse
import socket
from typing import List, Optional, Dict, Tuple
from browser_use import Agent, Browser, BrowserConfig
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from browser_use.agent.views import AgentHistoryList
import sys

# Global variables for cleanup
browser = None
shutdown_event = None

class SecurityError(Exception):
    """Exception raised for security-related issues."""
    pass

def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False

def is_url_safe(url: str) -> Tuple[bool, str]:
    """
    Check if a URL is safe to visit.
    Returns a tuple of (is_safe, reason).
    """
    try:
        parsed = urlparse(url)
        if not parsed.scheme in ['http', 'https']:
            return False, "Only HTTP and HTTPS protocols are allowed"
        
        if not parsed.netloc:
            return False, "Invalid URL format"
            
        # Get IP addresses for the hostname
        try:
            ip_addresses = [addr[4][0] for addr in socket.getaddrinfo(parsed.hostname, None)]
        except socket.gaierror:
            return False, f"Could not resolve hostname: {parsed.hostname}"
            
        # Check each IP address
        for ip in ip_addresses:
            if is_private_ip(ip):
                return False, f"Access to internal network addresses is not allowed: {ip}"
                
        return True, "URL is safe"
        
    except Exception as e:
        return False, f"URL validation error: {str(e)}"

async def cleanup():
    """Cleanup resources before exit"""
    if browser:
        print("\nClosing browser...")
        await browser.close()
    
def signal_handler():
    """Handle interrupt signal"""
    if shutdown_event:
        shutdown_event.set()

async def setup():
    """Setup global resources"""
    global browser, shutdown_event
    
    config = BrowserConfig(
        headless=True,
        disable_security=False
    )
    browser = Browser(config=config)
    shutdown_event = asyncio.Event()
    
    # Setup signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_event_loop().add_signal_handler(sig, signal_handler)
    
    return browser, shutdown_event

class TaskHandler:
    def __init__(self, browser: Browser):
        # Load configuration
        self.config = self._load_config()
        # Initialize account information
        self.accounts = self._get_accounts()
        # Use default account as task resolver
        self.default_account = self.accounts["default"]["address"]
        self.client = AsyncOpenAI(api_key=self.config['openai_api_key'])
        self.browser = browser

    def _create_agent(self, url: str, lang: str = 'en') -> Agent:
        """Create a new agent instance for a specific task
        
        Args:
            url: The URL to summarize
            lang: The language to output summary in, default is English ('en')
        """
        language_map = {
            'en': 'English',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German'
        }
        output_lang = language_map.get(lang, 'English')
       
        return Agent(
            browser=self.browser,
            task=f"""Visit {url} and provide a comprehensive summary in {output_lang} with the following structure:
                1. Title and URL
                2. Key Points
                3. Main Arguments
                4. Important Details
                5. AI Agent's related information
                6. Give a score for the content quality in 1-100 scale
                
                Format the output in markdown.""",
            llm=ChatOpenAI(
                api_key=self.config['openai_api_key'],
                model=self.config['model_name']
            ),
            use_vision = False
        )

    def _load_config(self) -> Dict:
        """Load configuration file"""
        try:
            config_path = os.path.join(os.path.dirname(__file__), 'config.json')
            with open(config_path, 'r') as f:
                config = json.load(f)
                required_fields = ['package_id', 'agent_address']
                missing_fields = [field for field in required_fields if field not in config]
                if missing_fields:
                    raise ValueError(f"Missing required config fields: {', '.join(missing_fields)}")
                return config
        except Exception as e:
            print(f"Error loading config: {e}")
            raise e

    def _get_accounts(self) -> Dict:
        """Get Rooch account list"""
        try:
            result = subprocess.run(
                ["rooch", "account", "list", "--json"],
                capture_output=True,
                text=True,
                check=True
            )
            return json.loads(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"Error getting accounts: {e.stderr}")
            raise e
        except json.JSONDecodeError as e:
            print(f"Error parsing account list JSON: {e}")
            raise e

    def run_command(self, command: List[str]) -> Optional[dict]:
        """Execute Rooch command and return JSON output"""
        try:
            if self.config.get('debug', False):
                print(f"\nExecuting command: {' '.join(command)}")
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            
            # Print raw output in debug mode
            # if self.config.get('debug', False):
            #     print(result.stdout)
            
            # If command output contains JSON data
            if result.stdout and '{' in result.stdout:
                json_result = json.loads(result.stdout)
                
                # For move run commands, check transaction status
                if "move" in command and "run" in command:
                    if 'output' in json_result and 'status' in json_result['output']:
                        status = json_result['output']['status']
                        if status.get('type') == 'moveabort':
                            raise Exception(f"Transaction failed: {status}")
                
                return json_result
            return None
        except subprocess.CalledProcessError as e:
            print(f"Error running command: {' '.join(command)}")
            print(f"Error output: {e.stderr}")
            raise e

    def get_pending_tasks(self) -> List[Dict]:
        """Get pending tasks"""
        try:
            # Build object type
            object_type = f"{self.config['package_id']}::task::Task"
            
            # Query tasks using rooch object command
            command = [
                "rooch", "object",
                "--object-type", object_type,
                "--owner", self.config['agent_address'],
                "--descending-order"
            ]
            
            result = self.run_command(command)
            pending_tasks = []
            
            if result and 'data' in result:
                for obj in result['data']:
                    # Check if task status is 0 (pending)
                    decoded_value = obj.get('decoded_value', {})
                    if decoded_value.get('type', '').endswith('::task::Task'):
                        task_data = decoded_value.get('value', {})
                        status = task_data.get('status')
                        if status == 0 or status == 1:
                            task_id = obj['id']
                            # Parse task name and arguments
                            task_name = task_data.get('name', '')
                            
                            if self.config.get('debug', False):
                                print(f"Find Task {task_id} is pending")

                            # Parse arguments
                            arguments = task_data.get('arguments', '{}')
                            
                            pending_tasks.append({    
                                'task_id': task_id,
                                'name': task_name,
                                'args': arguments,
                                'resolver': task_data.get('resolver', ''),
                                'creator': task_data.get('response_channel_id', ''),
                                'status': status
                            })
            
            return pending_tasks
        except Exception as e:
            print(f"Error getting pending tasks: {e}")
            return []

    def start_task(self, task_id: str, message: str):
        """Start task execution"""
        try:
            command = [
                "rooch", "move", "run",
                "--sender", self.default_account,
                "--function", f"{self.config['package_id']}::task_entry::start_task",
                "--args", f"object:{task_id}",
                "--args", f"string:{message}",
                "--json"
            ]
            self.run_command(command)
            print(f"Task {task_id} started")
        except Exception as e:
            print(f"Error starting task {task_id}: {e}")
            raise e

    def resolve_task(self, task_id: str, result: str):
        """Complete task and submit result"""
        try:
            command = [
                "rooch", "move", "run",
                "--sender", self.default_account,
                "--function", f"{self.config['package_id']}::task_entry::resolve_task_and_call_agent",
                "--args", f"object:{task_id}",
                "--args", f"string:{result}",
                "--json"
            ]
            self.run_command(command)
            print(f"Task {task_id} resolved successfully")
        except Exception as e:
            print(f"Error resolving task {task_id}: {e}")
            raise e

    def fail_task(self, task_id: str, message: str):
        """Mark task as failed"""
        try:
            command = [
                "rooch", "move", "run",
                "--sender", self.default_account,
                "--function", f"{self.config['package_id']}::task_entry::fail_task",
                "--args", f"object:{task_id}",
                "--args", f"string:{message}",
                "--json"
            ]
            self.run_command(command)
            print(f"Task {task_id} marked as failed")
        except Exception as e:
            print(f"Error failing task {task_id}: {e}")
            raise e
    

    async def execute_webpage_summary_task(self, task: Dict):
        """Execute webpage summary task using browser-use"""
        try:
            task_id = task.get('task_id')
            args = json.loads(task['args'])
            url = args['url']
            lang = args.get('lang', 'en')  # Default to English if not specified
            
            # Check URL safety
            is_safe, reason = is_url_safe(url)
            if not is_safe:
                error_message = f"Security Error: {reason}"
                if task_id:
                    self.fail_task(task_id, error_message)
                else:
                    print(f"\nError: {error_message}")
                raise SecurityError(error_message)
            
            if task_id:
                # Mark task start in non-debug mode
                if task.get('status') == 0:
                    start_message = f"Processing webpage: {url}"
                    self.start_task(task_id, start_message)
            
            try:
                # Create a new agent for this specific task
                agent = self._create_agent(url, lang)
                
                # Execute the task
                history: AgentHistoryList = await agent.run()
                
                summary = history.final_result()
                # Prepare response
                response = {
                    "url": url,
                    "lang": lang,
                    "summary": summary,
                    "timestamp": int(time.time())
                }
                
                if task_id:
                    # Submit task result in non-debug mode
                    self.resolve_task(task_id, summary)
                else:
                    # Print result in debug mode
                    print("\nSummary Result:")
                    print(json.dumps(response, ensure_ascii=False, indent=2))
                
                return response
                
            except Exception as e:
                error_message = f"Failed to process webpage: {str(e)}"
                if task_id:
                    self.fail_task(task_id, error_message)
                else:
                    print(f"\nError: {error_message}")
                raise e
                
        except Exception as e:
            print(f"Error executing webpage summary task: {e}")
            if not task_id:
                # Only re-raise in debug mode
                raise e

    async def task_subscriber(self, shutdown_event: asyncio.Event):
        """Task subscriber to monitor new tasks"""
        print(f"Task subscriber started for agent: {self.config['agent_address']}")
        while not shutdown_event.is_set():
            try:
                # Query pending tasks
                tasks = self.get_pending_tasks()
                
                # Process each pending task
                for task in tasks:
                    if shutdown_event.is_set():
                        break
                    if task["name"] == "task::webpage_summary":
                        await self.execute_webpage_summary_task(task)
                    
            except Exception as e:
                print(f"Error in task subscriber: {e}")
            
            try:
                # Wait for polling interval from config or until shutdown
                await asyncio.wait_for(
                    shutdown_event.wait(),
                    timeout=self.config.get('poll_interval', 1)
                )
            except asyncio.TimeoutError:
                continue

async def main():
    try:
        browser, shutdown_event = await setup()
        handler = TaskHandler(browser)
        
        if len(sys.argv) > 1 and sys.argv[1] == '--debug':
            # Debug mode: Process a single URL
            url = input("\nEnter URL to summarize: ")
            lang = input("\nEnter language (en/zh/ja/ko/es/fr/de) [default: en]: ").strip() or 'en'
            task = {
                'args': json.dumps({
                    'url': url,
                    'lang': lang
                })
            }
            await handler.execute_webpage_summary_task(task)
        else:
            # Normal mode: Subscribe to tasks
            await handler.task_subscriber(shutdown_event)
    except asyncio.CancelledError:
        print("\nShutdown requested...")
    except Exception as e:
        print(f"\nError: {e}")
    finally:
        await cleanup()
        print("Shutdown complete.")

if __name__ == "__main__":
    asyncio.run(main())
