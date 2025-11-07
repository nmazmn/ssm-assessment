FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /home/logs && \
    # Generate 100MB file with random data
    dd if=/dev/urandom of=/data/test-100mb.bin bs=1M count=100


CMD [ "node", "client.js" ]