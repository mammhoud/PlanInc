#!/bin/bash

# Colors for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if the network 'planinc-network' already exists
if [ ! "$(docker network ls -q -f name=planinc-network)" ]; then
    echo -e "${YELLOW}Network 'planinc-network' does not exist. Creating network...${NC}"
    docker network create planinc-network

    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create Docker network. Please check your Docker setup.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Successfully created Docker network: planinc-network${NC}"
else
    echo -e "${YELLOW}Network 'planinc-network' already exists. Skipping network creation.${NC}"
fi

# Step 2: Embedded datastore — nothing to start.
# The app keeps everything in a single SurrealDB (SurrealKV) file inside the
# container at /app/data, persisted by the named volume mounted in Step 4.
# There is no database container and no SQL database.
echo -e "${YELLOW}2. 🗄️  Embedded SurrealDB file in use — no database container to start.${NC}"

# Step 3: Prompt user to optionally mount the .planinc directory
echo -e "${YELLOW}Do you want to mount a local '.planinc' directory to '/app/.planinc' in the container? (y/n)${NC}"
read -p "Enter your choice: " mount_choice

if [[ "$mount_choice" == "y" || "$mount_choice" == "Y" ]]; then
    read -p "Please provide the path to your '.planinc' folder: " blnko_folder

    # Check if the directory exists; if not, create it
    if [ ! -d "$blnko_folder" ]; then
        echo -e "${YELLOW}Directory does not exist. Creating directory...${NC}"
        mkdir -p "$blnko_folder"

        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to create the directory. Please check permissions.${NC}"
            exit 1
        fi
    fi

    # Check if the directory has write permissions
    if [ ! -w "$blnko_folder" ]; then
        echo -e "${RED}The directory '$blnko_folder' does not have write permissions.${NC}"
        exit 1
    fi

    echo -e "${GREEN}Directory is ready for mounting: $blnko_folder${NC}"
    volume_mount="-v $blnko_folder:/app/.planinc"
else
    volume_mount=""
    echo -e "${YELLOW}Skipping mounting of .planinc directory.${NC}"
fi

# Step 4: Run PlanInc container with or without volume path
echo -e "${YELLOW}3. 🖥️ Starting PlanInc container...${NC}"
docker run -d \
  --name planinc-website \
  --network planinc-network \
  -p 1111:1111 \
  -e NODE_ENV=production \
  -e NEXTAUTH_SECRET=my_ultra_secure_nextauth_secret \
  -e PLANINC_DB_FILE=/app/data/planinc.db \
  -v planinc-data:/app/data \
  $volume_mount \
  --restart always \
  mammhoud/planinc:latest

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to start PlanInc container.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All containers are up and running.${NC}"

