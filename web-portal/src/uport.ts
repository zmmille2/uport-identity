import express = require('express');
import winston = require('winston');
import jsontokens = require('jsontokens');
import bodyParser = require('body-parser');
import config = require('config');
import qr = require('qr-image');

import { LoggingConfiguration } from 'meeteric-js';
import { IWeb3Adapter, Ethereum } from 'meeteric-js';

import { UportApp, Tokens, DateTime } from './Types';

LoggingConfiguration.initialize(null);
const app = express();

class UportAppConfig {
    public readonly UPort: any;
    public readonly Storage: any;
    public readonly RPCUrl: string;
    public readonly JWT: string;

    constructor(appConfig: any) {
        const DefaultTokenSecret = "Default Token Secret";

        this.UPort = appConfig.get("uport");
        this.Storage = appConfig.get("storage");
        this.RPCUrl = appConfig.get('rpcUrl');
        this.JWT = appConfig.get('jwtSecret');

        if (this.JWT === DefaultTokenSecret) {
            winston.warn("DEFAULT SECRET: Please update jwtSecret config value");
        }
    }
}

class UportWeb {
    private readonly uport: UportApp;
    private readonly tokens: Tokens;

    constructor(appConfig: UportAppConfig) {
        const callbackUrl = UportWeb.UpdateCallbackForAzure(appConfig.UPort);

        this.uport = new UportApp(appConfig.UPort, appConfig.Storage, appConfig.RPCUrl, callbackUrl);
        this.tokens = new Tokens(appConfig.JWT);
    }

    private static UpdateCallbackForAzure(uportConfig: any): string {
        const azure = config.get("azure");
        let result = uportConfig.callbackRoot;

        if (azure.instanceId !== null && azure.instanceId !== undefined) {
            winston.info('Updating call back since running in Azure');
            result = 'https://' + azure.websiteName + ".azurewebsites.net";
        }

        return result;
    }

    private NoCache(res: any) {
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');
    }

    private BearearTokenAuth(res: any, req: any, next: any) {
        winston.info("BearerAuthToken");
        next();
    }

    private LogRequest(req: any, res: any, next: any) {
        if (!req.url.startsWith("login-status", 1)
            && !req.url.startsWith("monitorTxQueue", 1)) {
            winston.debug(`${req.method} ${req.url}`);
        }

        next();
    }

    private async VerifyAuthorizationToken(req: any, res: any, next: any) {
        if (req.url.startsWith('verify-token', 1) || req.url.startsWith('authorize', 1)) {
            next();
        } else {
            try {
                var access_token;
                if (req.query.hasOwnProperty('token') && req.query.token !== undefined) {
                    access_token = req.query.token;
                    winston.debug('query');
                } else {
                    access_token = req.headers.authorization.substring(7);
                    winston.debug('header')
                }

                req.auth = await this.tokens.Read(access_token);
                req.auth.access_token = access_token;

                next();
            } catch (err) {
                winston.debug('RESPONSE 401 - Access Denied');

                if (access_token !== undefined) {
                    winston.debug(err);
                }

                res.statusCode = 401;
                res.send();
            }
        }
    }

    public Run() {
        const _self = this;
        const _uport = this.uport;
        app.set('port', process.env.PORT || process.env.APPSETTING_PORT || 8081);
        app.use(bodyParser.json({ type: '*/*' }));
        app.use(express.static('public'));
        app.use(this.LogRequest);
        app.use(async (req, res, next) => {
            await _self.VerifyAuthorizationToken(req, res, next);
        });

        app.get('/login-qr', async function (req: any, res: any) {
            _self.NoCache(res);
            const claims = {
                id: req.auth.id
            };
            await _uport.LoginQrCode(res, await _self.tokens.Sign(claims));
        });

        app.get('/transfer-qr/:packageId', async function (req: any, res: any) {
            _self.NoCache(res);
            const claims = {
                id: req.auth.id
            };
            await _uport.GenerateRequestOwnershipQRCode(req.params.packageId, res, await _self.tokens.Sign(claims));
        });

        app.get('/login-status', async function (req: any, res: any) {
            const requestId = req.auth.id;
            const result = await _uport.GetLoginStatus(requestId);
            _self.NoCache(res);
            let payload = {};

            if (result.status === "Exists") {

                winston.debug(result);

                const claims = {
                    name: result.value.name,
                    loginId: req.auth.id,
                    id: result.value.address
                };

                payload = ({
                    "access_token": await _self.tokens.Sign(claims, new DateTime().AddDays(1)),
                    "token_type": "Bearer"
                });
            } else {
                res.statusCode = 204;
            }
            res.json(payload);
        });

        app.post('/createContract', async function (req: any, res: any) {
            const data = req.auth;
            winston.debug(data);
            await _uport.CreateContract(data.id);
        });

        app.post('/newPackage', async function (req: any, res: any) {
            const data = req.auth;
            winston.debug(data);
            const claims = {
                id: req.auth.id
            };
            await _uport.RegisterNewPackage(data.id, req.body, await _self.tokens.Sign(claims));
            res.send();
        });

        app.post('/registerPackage/:packageId', async function (req: any, res: any) {
            await _uport.RegisterTx(req.params.packageId, req.body.tx);
            res.send();
        });

        app.post('/registerTransfer', async function (req: any, res: any) {
            const claims = {
                id: req.auth.id
            };
            await _uport.RegisterTransfer(req.query.packageId, req.body.tx, await _self.tokens.Sign(claims));
            res.send();
        });

        app.post('/transferPackage', async function (req: any, res: any) {
            const data = req.auth;
            await _uport.TransferPackage(data.id, req.query.packageId);
            res.send();
        });

        app.post('/monitorTxQueue', async function (req: any, res: any) {
            if (!await _uport.MonitorTxQueue()) {
                res.statusCode = 204;
            }
            res.send();
        });

        app.get('/verify-token', async function (req: any, res: any) {
            const payload: any = {
            };

            try {
                const access_token = req.headers.authorization.substring(7);
                const data = await this.tokens.Read(access_token);

                if (!_uport.VerifyId(data.id)) {
                    throw "No id found";
                }
                payload.access_token = access_token;
            } catch (err) {
                // catch all errors
            }

            if (payload.access_token === undefined) {
                res.statusCode = 201;
                const claims = await _self.uport.InitializeLogin();
                const requestToken = await _self.tokens.Sign(claims, new DateTime().AddMinutes(30));
                payload.login_uri = _self.uport.GenerateClientLoginUri(requestToken);
                payload.login_token = await _self.tokens.Sign(claims, new DateTime().AddMinutes(15));
            }

            _self.NoCache(res);
            res.json(payload);
        });

        app.get('/listPackages', async function (req: any, res: any) {
            const data = req.auth;
            _self.NoCache(res);
            res.json(await _uport.ListPackages());
        });

        app.get('/getPackageInfo/:id', async function (req: any, res: any) {
            const data = req.auth;
            _self.NoCache(res);
            res.json(await _uport.getPackageInfo(req.params.id));
        });


        app.post('/authorize/:token', async function (req: any, res: any) {
            const auth = await _self.tokens.Read(req.params.token);
            winston.debug(`Authenticating - ${auth.id}`);
            const token = req.body.access_token;
            await _uport.AuthorizeToken(auth.id, token);
            res.send();
        });

        const server = app.listen(app.get('port'), async function () {
            winston.info(`Tutorial app running... Port ${app.get('port')}`);
            await _uport.LogStartup();
        });
    }
}

new UportWeb(new UportAppConfig(config)).Run();