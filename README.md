# convid-accounts-backend

Accounts microservice for Convid remote access solution. This microservice handles Accounts and Machine registrations.

## Getting started

1. Generate your pair of keys (public/private) executing this command:
```
bash create-keys.sh
```

or go to https://8gwifi.org/jwsgen.jsp and saving the **private key** to `test_rsa.key` and the **public key** to `test_rsa.pub`


2. Run the project using this command:
```
MONGODB_USUARIO=usuario MONGODB_SENHA=senha docker-compose up -d
```

or you can execute `./start-dev`

3. You can check the api is running calling the url `http://localhost:9999`

4. Create a test account **without** TOTP:

```
curl --header 'Content-Type: application/json' -X POST http://localhost:9999/account -d '{"accountId":"00000000222200","email":"contato@email.com"}'
```

5. Create a test account **with** TOTP:

```
curl --header 'Content-Type: application/json' -X POST http://localhost:9999/account -d '{"accountId":"00000000111100","email":"contato@email.com", "totp":true}'
```

6. Fetch the created accounts:

```
curl -X GET http://localhost:9999/account
```

Now your server is up, running and able to supporte accounts with or without TOTP enrollment