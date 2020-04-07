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


## Using this backend to generate [SSH-JWT](https://hub.docker.com/r/flaviostutz/ssh-jwt) server enrollments

To use this Backend as a JWT Token provider with RS512 pub/priv key with a [SSH-JWT](https://hub.docker.com/r/flaviostutz/ssh-jwt) you must copy the **public key** (`.pub` file) to the [SSH-JWT](https://hub.docker.com/r/flaviostutz/ssh-jwt) server and pass it as a secret, as pointed at https://github.com/flaviostutz/ssh-jwt#rs512-pubpriv-signing-key