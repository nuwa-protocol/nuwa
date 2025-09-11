#!/bin/bash

# MCP Proxy instance management script
# Usage: ./manage.sh <command> [args...]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOYMENTS_DIR="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$DEPLOYMENTS_DIR/instances"

# Show help information
show_help() {
    cat << EOF
MCP Proxy Instance Management Tool

Usage: $0 <command> [args...]

Commands:
  list                          List all instances
  status [instance-name]        View instance status
  logs <instance-name>          View instance logs
  create <name> [type]          Create new instance (type: httpStream|stdio)
  deploy <instance-name>        Deploy instance
  update <instance-name>        Update instance
  update-all                    Update all instances
  delete <instance-name>        Delete instance
  env <instance-name>           Manage environment variables
  health [instance-name]        Health check

Examples:
  $0 list
  $0 create my-proxy httpStream
  $0 deploy my-proxy
  $0 status my-proxy
  $0 logs my-proxy
  $0 health my-proxy
EOF
}

# List all instances
list_instances() {
    echo "📋 MCP Proxy Instance List:"
    echo ""
    
    if [ ! -d "$INSTANCES_DIR" ] || [ -z "$(ls -A "$INSTANCES_DIR" 2>/dev/null)" ]; then
        echo "  (No instances)"
        echo ""
        echo "Create new instance: $0 create <name> [type]"
        return
    fi
    
    printf "%-20s %-15s %-30s %s\n" "Instance Name" "Type" "Deploy URL" "Status"
    printf "%-20s %-15s %-30s %s\n" "-------------" "----" "----------" "------"
    
    for instance_dir in "$INSTANCES_DIR"/*; do
        if [ -d "$instance_dir" ]; then
            instance_name=$(basename "$instance_dir")
            
            # Read configuration to get type
            config_file="$instance_dir/config.yaml"
            upstream_type="unknown"
            if [ -f "$config_file" ]; then
                upstream_type=$(grep -A1 "upstream:" "$config_file" | grep "type:" | sed 's/.*type: *"\([^"]*\)".*/\1/' || echo "unknown")
            fi
            
            # Read deployment information
            deploy_info="$instance_dir/.deployment-info"
            deploy_url="Not deployed"
            status="Unknown"
            
            if [ -f "$deploy_info" ]; then
                deploy_url=$(grep "DEPLOY_URL=" "$deploy_info" | cut -d'=' -f2 || echo "Unknown")
                
                # Simple health check
                if command -v curl &> /dev/null && [ "$deploy_url" != "Not deployed" ]; then
                    if curl -s --max-time 5 "$deploy_url/health" > /dev/null 2>&1; then
                        status="✅ Running"
                    else
                        status="❌ Error"
                    fi
                else
                    status="❓ Not checked"
                fi
            else
                status="📦 Not deployed"
            fi
            
            printf "%-20s %-15s %-30s %s\n" "$instance_name" "$upstream_type" "$deploy_url" "$status"
        fi
    done
}

# View instance status
show_status() {
    local instance_name="$1"
    
    if [ -z "$instance_name" ]; then
        # Show all instance status
        list_instances
        return
    fi
    
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    if [ ! -d "$instance_dir" ]; then
        echo "❌ Instance '$instance_name' does not exist"
        return 1
    fi
    
    echo "📊 Instance status: $instance_name"
    echo ""
    
    # Configuration information
    if [ -f "$instance_dir/config.yaml" ]; then
        echo "📋 Configuration information:"
        echo "  Config file: $instance_dir/config.yaml"
        
        upstream_type=$(grep -A1 "upstream:" "$instance_dir/config.yaml" | grep "type:" | sed 's/.*type: *"\([^"]*\)".*/\1/' || echo "unknown")
        echo "  Upstream type: $upstream_type"
        
        service_id=$(grep "serviceId:" "$instance_dir/config.yaml" | sed 's/.*serviceId: *"\([^"]*\)".*/\1/' || echo "unknown")
        echo "  Service ID: $service_id"
        echo ""
    fi
    
    # Deployment information
    if [ -f "$instance_dir/.deployment-info" ]; then
        echo "🚀 Deployment information:"
        source "$instance_dir/.deployment-info"
        echo "  Deploy URL: $DEPLOY_URL"
        echo "  Project ID: $PROJECT_ID"
        echo "  Deploy time: $DEPLOYED_AT"
        echo ""
        
        # Health check
        echo "🏥 Health check:"
        if command -v curl &> /dev/null; then
            if curl -s --max-time 10 "$DEPLOY_URL/health" > /dev/null 2>&1; then
                echo "  Status: ✅ Healthy"
            else
                echo "  Status: ❌ Error"
            fi
        else
            echo "  Status: ❓ Cannot check (curl required)"
        fi
    else
        echo "📦 Not deployed"
    fi
}

# Health check
health_check() {
    local instance_name="$1"
    
    if [ -z "$instance_name" ]; then
        echo "🏥 All instances health check:"
        echo ""
        
        for instance_dir in "$INSTANCES_DIR"/*; do
            if [ -d "$instance_dir" ]; then
                local name=$(basename "$instance_dir")
                printf "%-20s " "$name:"
                health_check "$name" | tail -1
            fi
        done
        return
    fi
    
    local instance_dir="$INSTANCES_DIR/$instance_name"
    local deploy_info="$instance_dir/.deployment-info"
    
    if [ ! -f "$deploy_info" ]; then
        echo "❌ Not deployed"
        return 1
    fi
    
    source "$deploy_info"
    
    if ! command -v curl &> /dev/null; then
        echo "❓ Cannot check (curl required)"
        return 1
    fi
    
    echo "🔍 Checking $DEPLOY_URL/health ..."
    
    if response=$(curl -s --max-time 10 "$DEPLOY_URL/health" 2>/dev/null); then
        echo "✅ Healthy - $response"
    else
        echo "❌ Error - Cannot connect"
        return 1
    fi
}

# 主命令处理
case "${1:-help}" in
    "list"|"ls")
        list_instances
        ;;
    "status")
        show_status "$2"
        ;;
    "logs")
        if [ -z "$2" ]; then
            echo "Usage: $0 logs <instance-name>"
            exit 1
        fi
        
        instance_dir="$INSTANCES_DIR/$2"
        if [ ! -f "$instance_dir/.railway-project-id" ]; then
            echo "❌ Instance '$2' not deployed or project ID does not exist"
            exit 1
        fi
        
        project_id=$(cat "$instance_dir/.railway-project-id")
        railway link "$project_id"
        railway logs
        ;;
    "create")
        "$SCRIPT_DIR/create-instance.sh" "$2" "$3"
        ;;
    "deploy")
        "$SCRIPT_DIR/deploy.sh" "$2"
        ;;
    "update")
        if [ -z "$2" ]; then
            echo "用法: $0 update <instance-name>"
            exit 1
        fi
        echo "🔄 Updating instance: $2"
        "$SCRIPT_DIR/deploy.sh" "$2"
        ;;
    "update-all")
        echo "🔄 Updating all instances..."
        for instance_dir in "$INSTANCES_DIR"/*; do
            if [ -d "$instance_dir" ] && [ -f "$instance_dir/.railway-project-id" ]; then
                instance_name=$(basename "$instance_dir")
                echo "📦 Updating $instance_name..."
                "$SCRIPT_DIR/deploy.sh" "$instance_name"
                echo ""
            fi
        done
        ;;
    "delete"|"rm")
        if [ -z "$2" ]; then
            echo "Usage: $0 delete <instance-name>"
            exit 1
        fi
        
        instance_dir="$INSTANCES_DIR/$2"
        if [ ! -d "$instance_dir" ]; then
            echo "❌ Instance '$2' does not exist"
            exit 1
        fi
        
        echo "⚠️  Are you sure you want to delete instance '$2'? (y/N)"
        read -r confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            rm -rf "$instance_dir"
            echo "✅ Instance '$2' deleted"
            echo "Note: Railway project needs to be deleted manually"
        else
            echo "Deletion cancelled"
        fi
        ;;
    "env")
        if [ -z "$2" ]; then
            echo "Usage: $0 env <instance-name>"
            exit 1
        fi
        
        instance_dir="$INSTANCES_DIR/$2"
        if [ ! -f "$instance_dir/.railway-project-id" ]; then
            echo "❌ Instance '$2' not deployed"
            exit 1
        fi
        
        project_id=$(cat "$instance_dir/.railway-project-id")
        railway link "$project_id"
        railway variables
        ;;
    "health")
        health_check "$2"
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
