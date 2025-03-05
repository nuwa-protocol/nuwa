#!/usr/bin/env python3

import json
import sys
import subprocess
from datetime import datetime
import argparse
from typing import Dict, Any, Optional

def decode_hex(hex_string: str) -> str:
    """Decode a hex string to UTF-8 text."""
    if hex_string.startswith('0x'):
        hex_string = hex_string[2:]
    try:
        return bytes.fromhex(hex_string).decode('utf-8')
    except Exception:
        return "[Unable to decode hex]"

def format_timestamp(timestamp_ms: str) -> str:
    """Format a millisecond timestamp to a human-readable date string."""
    timestamp_s = int(timestamp_ms) / 1000
    return datetime.fromtimestamp(timestamp_s).strftime('%Y-%m-%d %H:%M:%S')

def fetch_object_by_id(object_id: str) -> Dict[str, Any]:
    """Fetch object data using rooch object -i command."""
    print(f"Fetching object data for ID: {object_id}...")
    try:
        result = subprocess.run(
            ['rooch', 'object', '-i', object_id], 
            capture_output=True, 
            text=True, 
            check=True
        )
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        print(f"Error executing rooch command: {e}")
        print(f"stderr: {e.stderr}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing response from rooch command: {e}")
        sys.exit(1)

def fetch_latest_request() -> Dict[str, Any]:
    """Fetch the latest Oracle request object."""
    print("Fetching the latest Oracle request object...")
    try:
        result = subprocess.run(
            [
                'rooch', 'object', 
                '-t', '0xf1290fb0e7e1de7e92e616209fb628970232e85c4c1a264858ff35092e1be231::oracles::Request',
                '-d', '--limit', '1'
            ], 
            capture_output=True, 
            text=True, 
            check=True
        )
        data = json.loads(result.stdout)
        
        # Check if we got any data
        if not data.get('data'):
            print("No Oracle request objects found.")
            sys.exit(1)
            
        return data
    except subprocess.CalledProcessError as e:
        print(f"Error executing rooch command: {e}")
        print(f"stderr: {e.stderr}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error parsing response from rooch command: {e}")
        sys.exit(1)

def extract_nested_value(data: Dict[str, Any], path: str) -> Optional[Any]:
    """Extract a nested value from a dictionary using dot notation path."""
    current = data
    for key in path.split('.'):
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current

def process_request_body(body: str) -> str:
    """Process and format the request body."""
    try:
        # Try to parse as JSON
        body_json = json.loads(body)
        
        # Special handling for OpenAI API requests
        if 'messages' in body_json and isinstance(body_json['messages'], list):
            # Extract the model and other info first
            result = f"Model: {body_json.get('model', 'Not specified')}\n"
            if 'temperature' in body_json:
                result += f"Temperature: {body_json['temperature']}\n"
            
            # Add a separator before messages
            result += "\n----- Messages -----\n\n"
            
            # Print each message with role and content
            for msg in body_json['messages']:
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                
                # Format the role with proper capitalization
                formatted_role = role.upper() if role == "system" else role.capitalize()
                
                # Add the message
                result += f"[{formatted_role}]\n{content}\n\n"
                
            return result
        else:
            # For other JSON types, use standard formatting
            return json.dumps(body_json, indent=2)
            
    except json.JSONDecodeError:
        # If not JSON, return truncated version
        preview_length = min(200, len(body))
        return f"{body[:preview_length]}...\n(Request body truncated for readability)"
    except Exception as e:
        return f"Error processing request body: {e}"

def process_openai_response(response_json: Dict[str, Any]) -> Optional[str]:
    """Extract the assistant's message content from an OpenAI API response."""
    try:
        if ('choices' in response_json and 
            response_json['choices'] and 
            'message' in response_json['choices'][0] and 
            'content' in response_json['choices'][0]['message']):
            return response_json['choices'][0]['message']['content']
    except:
        pass
    return None

def analyze_oracle_request(data: Dict[str, Any]) -> None:
    """Analyze and display Oracle request details in a user-friendly format."""
    # Extract the object information (assuming first item in data array)
    if 'data' not in data or not data['data']:
        print("Error: No object data found")
        sys.exit(1)
        
    obj = data['data'][0]
    decoded_value = obj.get('decoded_value', {})
    value = decoded_value.get('value', {})
    
    # Display basic object information
    print("\n===== Oracle Request Object =====\n")
    print(f"ID: {obj['id']}")
    print(f"Type: {obj['object_type']}")
    print(f"Owner: {obj['owner']}")
    print(f"Created: {format_timestamp(obj['created_at'])}")
    print(f"Updated: {format_timestamp(obj['updated_at'])}")
    
    # Display request details
    print("\n===== Request Details =====\n")
    if 'amount' in value:
        print(f"Amount: {value['amount']} (Gas)")
    if 'request_account' in value:
        print(f"Requester: {value['request_account']}")
    if 'oracle' in value:
        print(f"Oracle: {value['oracle']}")
    
    # Extract HTTP request details
    print("\n===== HTTP Request =====\n")
    params = extract_nested_value(value, 'params.value')
    if params:
        if 'url' in params:
            print(f"URL: {params['url']}")
        if 'method' in params:
            print(f"Method: {params['method']}")
        
        # Process headers
        if 'headers' in params:
            print("\nHeaders:")
            try:
                headers_json = json.loads(params['headers'])
                if headers_json:
                    print(json.dumps(headers_json, indent=2))
                else:
                    print("No headers specified")
            except:
                print(params['headers'])
                
        # Process body
        if 'body' in params:
            print("\nRequest Body:")
            print(process_request_body(params['body']))
    
    # Extract and decode notify callback if present
    notify_vec = extract_nested_value(value, 'notify.value.vec')
    if notify_vec:
        try:
            hex_string = extract_nested_value(notify_vec, 'value.0.0')
            if hex_string:
                print("\n===== Callback Details =====\n")
                print(f"Callback: {decode_hex(hex_string)}")
        except (KeyError, IndexError):
            pass
    
    # Extract response status and details
    print("\n===== Response =====\n")
    if 'response_status' in value:
        print(f"Status: {value['response_status']}")

     
    # Extract and decode response if present
    response_vec = extract_nested_value(value, 'response.value.vec')
    if response_vec:
        try:
            # 找到正确的嵌套路径
            if 'value' in response_vec and isinstance(response_vec['value'], list) and len(response_vec['value']) > 0:
                if isinstance(response_vec['value'][0], list) and len(response_vec['value'][0]) > 0:
                    hex_string = response_vec['value'][0][0]
                    
                    if hex_string:
                        decoded = decode_hex(hex_string)
                        
                        print("\nResponse Content:")
                        try:
                            # Try to parse as JSON for better formatting
                            json_str_response = json.loads(decoded)
                            json_response = json.loads(json_str_response)
                            print(json.dumps(json_response, indent=2))
                            
                            # Extract OpenAI message content if available
                            ai_content = process_openai_response(json_response)
                            if ai_content:
                                print("\n===== AI Response Content =====\n")
                                print(ai_content)
                        except json.JSONDecodeError:
                            print(decoded)
                        except Exception as e:
                            print(f"Error processing response: {e}")
                            print(decoded)
        except (KeyError, IndexError) as e:
            print(f"Error extracting response: {e}")
            print(f"Response structure: {response_vec}")
    else:
        print("\nNo response content available")

    print("\n===== End of Oracle Request Details =====\n")

def main():
    parser = argparse.ArgumentParser(description='Decode and display Rooch Oracle request objects')
    parser.add_argument('object_id', nargs='?', help='Object ID of the Oracle request to decode. If not provided, shows the latest request.')
    
    args = parser.parse_args()
    
    try:
        # Fetch object data - either by ID or get the latest
        if args.object_id:
            data = fetch_object_by_id(args.object_id)
        else:
            data = fetch_latest_request()
        
        # Analyze and display the data
        analyze_oracle_request(data)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()