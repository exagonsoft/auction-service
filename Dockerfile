# Use the official Node.js image as the base image
FROM node:21-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Build the project
RUN npm run build

# Expose the application port
EXPOSE 4040

# Command to run the application
CMD ["npm", "run", "start"]
