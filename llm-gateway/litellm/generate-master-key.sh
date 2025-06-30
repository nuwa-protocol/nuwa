#!/bin/bash

# Generate a random key with "sk-" prefix followed by 32 random bytes in base64
RANDOM_PART=$(openssl rand -base64 32 | tr -d '\n' | tr -d '=' | tr '+/' '-_' | cut -c 1-48)
MASTER_KEY="sk-${RANDOM_PART}"

echo "Generated LiteLLM Master Key:"
echo $MASTER_KEY
echo

# Provide instructions for adding to .env file
echo "To add this key to your .env file, run:"
echo "echo \"MASTER_KEY=$MASTER_KEY\" >> .env"
echo

# Offer option to directly update .env file
read -p "Would you like to add this key to your .env file now? (y/n): " ANSWER
if [[ "$ANSWER" == "y" || "$ANSWER" == "Y" ]]; then
    if [ -f .env ]; then
        # Check if MASTER_KEY already exists in .env
        if grep -q "^MASTER_KEY=" .env; then
            # Replace existing MASTER_KEY
            sed -i.bak "s/^MASTER_KEY=.*/MASTER_KEY=$MASTER_KEY/" .env
            echo "Replaced existing MASTER_KEY in .env file"
        else
            # Append new MASTER_KEY
            echo "MASTER_KEY=$MASTER_KEY" >> .env
            echo "Added MASTER_KEY to .env file"
        fi
    else
        # Create new .env file
        echo "MASTER_KEY=$MASTER_KEY" > .env
        echo "Created new .env file with MASTER_KEY"
    fi
    
    echo "You can now run ./update-env.sh to apply this key to your Kubernetes deployment"
fi 