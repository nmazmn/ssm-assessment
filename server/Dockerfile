FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and the pnpm lockfile
COPY package.json pnpm-lock.yaml ./

# Install dependencies using pnpm
# This will also fetch the NestJS CLI to run the build
RUN pnpm install

# Bundle app source
COPY . .

# Build the app using pnpm
RUN pnpm run build

# Your app binds to port 3000
EXPOSE 3000

# Define the command to run your app
CMD [ "node", "dist/main" ]