# Webpage Summary Task Example

This is a web page summary task agent example based on the Rooch Nuwa framework, demonstrating how to build an AI-driven off-chain task processor. The agent can automatically fetch web content and generate multilingual summaries.

## Features

- Multi-language summary generation (English, Chinese, Japanese, Korean, Spanish, French, German)
- Automatic monitoring and processing of on-chain task requests
- High-quality summaries using OpenAI GPT models
- Built-in security checks to prevent internal network access
- Debug mode for single task testing

## Environment Setup

### Prerequisites

- Python 3.11+ (Required)
  - For Ubuntu users: You need to upgrade Python to 3.11+ first:
    ```bash
    # Add deadsnakes PPA
    sudo add-apt-repository ppa:deadsnakes/ppa
    sudo apt update
    
    # Install Python 3.11
    sudo apt install python3.11 python3.11-venv python3.11-dev
    
    # Install pip for Python 3.11
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11
    ```
- Rooch CLI tool
- OpenAI API key
- Playwright (for web content scraping)

### Python Environment Setup

1. Create Python virtual environment:
```bash
python3 -m venv venv
```

2. Activate virtual environment:
```bash
# macOS/Linux
source venv/bin/activate

# Windows
.\venv\Scripts\activate
```

Note: On macOS, it's recommended to use `python3` command instead of `python` to ensure you're using the correct Python version in your virtual environment. If you encounter any issues with `python` command, you can unalias it in your virtual environment:
```bash
unalias python
```

### Dependencies Installation

1. Install Python packages:
```bash
pip install -r requirements.txt
```

2. Install Playwright:
```bash
pip install playwright
playwright install
```

Main dependencies include:
- browser-use: Browser automation and AI control
- langchain-openai: LLM integration
- openai: Content processing

### Rooch CLI Initialization

```bash
rooch init
rooch env switch --alias test
rooch account list
```

## Configuration

### AI Agent Configuration

Create AI Agent and add task configuration:

```json
[
  {
    "name": "task::webpage_summary",
    "description": "Get a summary of a URL",
    "arguments": [
      {
        "name": "url",
        "type_desc": "string",
        "description": "The URL to summarize",
        "required": true
      },
      {
        "name": "lang",
        "type_desc": "string",
        "description": "The language to output summary in: en,zh,ja,ko,es,fr,de",
        "required": true
      }
    ],
    "resolver": "Your local rooch account address",
    "on_chain": false,
    "price": "0"
  }
]
```

### Program Configuration

Create `config.json` file:

```json
{
    "package_id": "0xb5ee31dafd362db98685b17aaf3fb8b20f36746cd0b34a4086fbdf39f13a1c3b",
    "agent_address": "YOUR_AGENT_ADDRESS",
    "openai_api_key": "YOUR_OPENAI_API_KEY",
    "model_name": "gpt-4o",
    "poll_interval": 10,
    "debug": false
}
```

## Usage

### Debug Mode

For testing single URL summary generation:

```bash
python3 main.py --debug
```

The program will prompt for:
- URL: The webpage to summarize
- Language: Output summary language (default is English)

### Normal Mode

Run as a task processing agent:

```bash
python3 main.py
```

The agent will automatically monitor and process on-chain task requests.


## Task Processing Flow

1. Monitor on-chain tasks
2. Validate URL security
3. Fetch webpage content
4. Generate AI summary
5. Submit results back to chain

## Development Extension

This example demonstrates how to:

1. Build an off-chain task processor
2. Integrate AI capabilities
3. Handle on-chain state
4. Implement security checks
5. Manage asynchronous resources

You can use this example as a base to develop other types of AI agent task processors.


## Contributing

Issues and Pull Requests are welcome to improve this example.

## License

Apache License 2.0 