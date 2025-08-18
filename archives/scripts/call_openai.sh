#!/bin/bash

# Get the hex prompt from the first argument or use a default file
hex_prompt="${1:-$(cat prompt.hex)}"

# Remove 0x prefix if present and convert hex to text
prompt_txt=$(echo "$hex_prompt" | sed 's/^0x//' | xxd -r -p)
echo "Prompt:";
echo "$prompt_txt"
escaped_prompt=$(echo "$prompt_txt" | jq -Rs .)


# Call OpenAI API with GPT-4 Optimized
response=$(curl -s -X POST https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d "{
  \"model\": \"gpt-4o\",
  \"messages\": [
    {
      \"role\": \"system\",
      \"content\": ${escaped_prompt}
    }
  ],
  \"temperature\": 1.1,
  \"max_tokens\": 2000
}")

echo "Response:";
echo "$response"

echo "Actions:";
# Extract just the content from the response using jq
echo "$response" | jq -r '.choices[0].message.content'