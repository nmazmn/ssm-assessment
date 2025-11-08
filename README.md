# Distributed File Transfer System Demo

A robust, scalable file transfer system designed to handle large file uploads from on-premise clients behind NAT/firewalls to cloud servers using a hybrid MQTT + HTTP architecture.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Configuration](#configuration)
- [Demo](#Demo)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This system demo a solution for transferring large files (100MB+ such as logs file) from on-premise clients to cloud servers, even when clients are behind NAT/firewalls. It uses a combination of MQTT to trigger the file transfer from server to any clients and HTTP for efficient chunk-based file uploads from clients to the server.

### Key Capabilities

- ✅ Large file transfers (100MB - 1GB+)
- ✅ Chunk-based upload with resume capability
- ✅ Works behind NAT/firewalls
- ✅ Real-time transfer status via MQTT

## 🏗️ Architecture

### System Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                        Server Infrastructure                    │
│                                                                 │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │              │◄────►│    MQTT      │◄────►│              │   │
│  │   Server     │      │   Broker     │      │   Client     │   │
│  │ (Cloud user) │      │ (Mosquitto)  │      │ (Distributed |   |
|  |              |      |              |      |    system)   |   │
│  │              │      |              │      │              │   │
│  └──────┬───────┘      └──────────────┘      └──────┬───────┘   │
│         │                                           │           │
│         │              ┌──────────────┐             │           │
│         └───────────── │  HTTP (file  │─────────────┘           │
│                        │    upload)   │                         │
│                        └──────────────┘                         │
│                                                                 │
└ ────────────────────────────────────────────────────────────────
```

### Architecture Flow

1. **Client Initiation**
   - Client connects to MQTT broker and subscribes to transfer topics
   - Each clients subscribe to unique command based on clientId
   - Client initiates transfer request via cloud server
   - Server generates unique `transferId` and responds with upload details

2. **File Chunking & Upload**
   - Client splits file into chunks (default: 5MB)
   - Each chunk is uploaded via HTTP POST to cloud server
   - cloud server saves chunks to temporary storage

3. **MQTT Coordination**
   - Progress updates published to MQTT topics
   - Real-time status available to all subscribers
   - Transfer state managed through MQTT messages

4. **Chunk Assembly**
   - After all chunks uploaded, merge request sent to cloud server
   - cloud server combines chunks into final file
   - Verification and cleanup performed

5. **Completion**
   - Final status published via MQTT
   - Client notified of successful transfer
   - Temporary chunks removed

## ✨ Features

### Features

- **Chunk-Based Upload**: Files split into manageable chunks (configurable size)
- **Resume Capability**: Failed transfers can resume from last successful chunk
- **NAT/Firewall Friendly**: Clients initiate all connections (outbound only)
- **Real-Time Status**: MQTT-based progress tracking and notifications
- **Data ingegrity and retry machanism**: Hash Sum verification to ensure data integrity and will retry if the data corrupted
- **Retry mechanism**: The client will attempt to retry the upload process if some error occured

## ⚙️ Configuration

Demo client file is generated inside the Client container using Dockerfile

### Environment Variables
All the enverionment variables is set direcrty in the docker-compose file for demo purposes.


### MQTT Broker Configuration
For the demo purposes there are no username/password set for MQTT authentication

## 📖 Demo

### Clone the project
```bash
git clone https://github.com/nmazmn/ssm-assessment.git (https) / git clone git@github.com:nmazmn/ssm-assessment.git (ssh)
cd ssm-assessment
```

### Builld the image
```bash
docker-compose build
```

### Starting the System
```bash
# Start all services
docker-compose up -d

# Verify all container up and running
docker ps

# View logs
docker-compose logs -f {container_name}
```

### Triggering file transfer from isolated client to cloud server demo

#### Direct API Calls (For demo purposes the client_id used are client-123 & client-456 representing 2 isolated client machine)
```bash
# Initiate transfer
curl --location 'http://localhost:3000/download/{client_id}'
```

OR

Use postman to trigger GET http://localhost:3000/download/{client_id}

### Monitoring Transfers
```bash
# View transfer logs
docker-compose logs -f nestjs-server
docker-compose logs -f node-client
docker-compose logs -f mosaquitto-broker
```

After the file transfer succesfully completed the file will be available in generated server-uploads folder.

### Running Tests
```bash
# server tests
cd server
pnpm test                 

# client tests
cd client
pnpm test
```

## 🐛 Troubleshooting

### Common Issues

#### Issue: Client can't connect to MQTT broker
```bash
# Check if MQTT broker is running
docker-compose ps mosquitto-broker

# Check broker logs
docker-compose logs mosquitto-broker

# Test MQTT connection
docker-compose exec mosquitto-broker mosquitto_pub -t test -m "hello"
docker-compose exec mosquitto-broker mosquitto_sub -t test -C 1
```

#### Issue: Chunk upload fails with ENOENT error
```bash
# Ensure upload directory exists
docker-compose exec nestjs-server mkdir -p server-uploads/temp

# Check permissions
docker-compose exec nestjs-server ls -la server-uploads/

# Restart NestJS server
docker-compose restart nestjs-server
```

### Debug Mode
```bash
# Run services with verbose logging
docker-compose up

# Enable NestJS debug mode
docker-compose run -e LOG_LEVEL=debug nestjs-server

# View real-time logs
docker-compose logs -f --tail=100
```

### Performance Issues
```bash
# Check container resources
docker stats

# Check disk usage
docker system df

# Increase chunk size for faster uploads
docker-compose run -e CHUNK_SIZE=10485760 client node client.js
```

## ✨ Demo video
[View demo video](https://drive.google.com/file/d/1d7yTWMnfMJ_RkMJ2tgoOhefg20hgJElB/view?usp=sharing)
