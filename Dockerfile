FROM node:11-alpine

ENV WITH_TOTP="false"

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY ./src .

EXPOSE 9999

CMD [ "npm", "start" ]