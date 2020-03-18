FROM node:11-alpine

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY ./src/server.js .

EXPOSE 9999

CMD [ "npm", "start" ]