#!/bin/bash

# Fixed namespace
NAMESPACE="nuwa"

echo "Using namespace: $NAMESPACE"

# Check if the namespace exists
kubectl get namespace $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
    echo "Creating namespace '$NAMESPACE'..."
    kubectl create namespace $NAMESPACE
fi

# Check if ConfigMap exists, create if not
kubectl get configmap litellm-config -n $NAMESPACE &> /dev/null
if [ $? -ne 0 ]; then
  echo "Creating new ConfigMap 'litellm-config' in namespace '$NAMESPACE'..."
  kubectl create configmap litellm-config --from-file=config.yaml -n $NAMESPACE
else
  echo "Updating existing ConfigMap 'litellm-config' in namespace '$NAMESPACE'..."
  kubectl create configmap litellm-config --from-file=config.yaml -o yaml --dry-run=client | kubectl apply -f - -n $NAMESPACE
fi

# Restart Deployment to apply new configuration
echo "Restarting litellm deployment in namespace '$NAMESPACE' to apply new configuration..."
kubectl rollout restart deployment litellm -n $NAMESPACE

echo "Configuration updated successfully!" 