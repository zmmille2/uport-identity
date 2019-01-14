## Introduction

This is a sample infrastructure for tracking product movement through a supply chain on blockchain.

## Getting started
1. Using [UPort](https://www.uport.me/)
    - Download the app on your phone and make an account.
2. Setup an Ethereum RPC endpoint with `geth`.
    - Download and install `geth` from its [download page](https://geth.ethereum.org/downloads/).
    - Run `geth --rpcapi "eth, net, debug"`
    - Get the `http` endpoint for the RPC address
4. Setup NGrok or expose a port on the VM
    - Download ngrok from the [download page](https://ngrok.com/download)
    - Run `ngrok http 8081`
6. Update the `callbackRoot` value in `config/default.json` or set the environment variable with the ngrok https address
    `SET UPORT_CALLBACK_ROOT={ngrok https address}`
7. Build and run the application with `npm run build-start-uport`
8. Navigate to the ngrok address. View QR Code in UPort app.