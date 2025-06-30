#!/bin/bash

# Default env file path
ENV_FILE=".env"
NAMESPACE="nuwa"

# Check if a custom env file path is provided
if [ "$#" -eq 1 ]; then
    ENV_FILE=$1
fi

# Check if the env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file '$ENV_FILE' not found."
    echo "Usage: $0 [env_file_path]"
    echo "Default env file path is '.env' in the current directory."
    echo ""
    echo "The .env file should contain environment variables in KEY=VALUE format, one per line."
    echo "Example .env file content:"
    echo "OPENAI_API_KEY=sk-abcdefg123456"
    echo "OPENAI_API_BASE=https://api.openai.com/v1"
    echo "MASTER_KEY=sk-your-master-key"
    echo "DATABASE_URL=your-db-url"
    exit 1
fi

echo "Using environment file: $ENV_FILE"
echo "Using namespace: $NAMESPACE"

# Create a temporary YAML file
cat > temp_secret.yaml << EOF
apiVersion: v1
kind: Secret
metadata:
  name: litellm-env
  namespace: $NAMESPACE
type: Opaque
data:
EOF

# Read the env file line by line
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comments
    if [[ -z "$line" || "$line" =~ ^# ]]; then
        continue
    fi
    
    # Extract key and value
    if [[ "$line" =~ ^([^=]+)=(.*)$ ]]; then
        KEY_NAME="${BASH_REMATCH[1]}"
        VALUE="${BASH_REMATCH[2]}"
        
        # Remove surrounding quotes if present
        VALUE=$(echo "$VALUE" | sed -E 's/^"(.*)"$/\1/')
        VALUE=$(echo "$VALUE" | sed -E "s/^'(.*)'$/\1/")
        
        # Encode value to base64
        VALUE_BASE64=$(echo -n "$VALUE" | base64)
        
        # Add to the YAML file
        echo "  $KEY_NAME: $VALUE_BASE64" >> temp_secret.yaml
    fi
done < "$ENV_FILE"

# Check if any environment variables were found
if [ $(grep -c ":" temp_secret.yaml) -eq 0 ]; then
    echo "Error: No valid environment variables found in '$ENV_FILE'."
    rm temp_secret.yaml
    exit 1
fi

# Check if the namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
    echo "Creating namespace '$NAMESPACE'..."
    kubectl create namespace $NAMESPACE
fi

# Check if the secret exists
kubectl get secret litellm-env -n $NAMESPACE &> /dev/null
if [ $? -eq 0 ]; then
    echo "Updating existing secret 'litellm-env' in namespace '$NAMESPACE'..."
else
    echo "Creating new secret 'litellm-env' in namespace '$NAMESPACE'..."
fi

# Apply the Secret configuration
kubectl apply -f temp_secret.yaml

# Remove the temporary file
rm temp_secret.yaml

# Restart the Deployment to apply new environment variables
kubectl rollout restart deployment litellm -n $NAMESPACE

echo "Environment variables from '$ENV_FILE' have been updated in 'litellm-env' Secret in namespace '$NAMESPACE'."
echo "Deployment is restarting to apply the changes." 