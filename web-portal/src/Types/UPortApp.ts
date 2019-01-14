import winston = require('winston');
import config = require('config');

import {
    ContractFactory,
    UPortFactory,
    IStorage,
    IEventBus,
    IWeb3Adapter,
    Ethereum,
    AzureBlobStorage,
    FileSystemStorage,
    AzureServiceBusEventBus,
    ServiceBusConfig,
    EventBusGroup,
    Sha256Notary
} from 'meeteric-js';

import {
    AuthorizationManager,
    DateTime,
    UI
} from './';
import _ = require('lodash');

const EthereumWeb3Adapter = Ethereum.Web3.EthereumWeb3Adapter;

export class UportApp {
    private readonly web3: IWeb3Adapter;
    private readonly factory: ContractFactory;
    private readonly storage: IStorage;
    private readonly uport: UPortFactory;
    private readonly callbackRoot: string;
    private readonly contractAddress: string;
    private readonly ethereum: Ethereum.EthereumReader;
    private readonly auth: AuthorizationManager;
    private readonly notary: Sha256Notary;
    private readonly tokens: any;
    private readonly packages_cache: any;
    private readonly txQueue: any;

    public constructor(uportConfig: any, storageConfig: any, rpcUrl: string, callbackUrl: string) {
        this.storage = UportApp.GetStorage(`${storageConfig.root}/Tokens`, storageConfig);
        const contracts = UportApp.GetStorage(`${storageConfig.root}/Contracts`, storageConfig);
        this.uport = new UPortFactory(uportConfig.app.name, uportConfig.network, uportConfig.app.id, uportConfig.app.secret);
        this.callbackRoot = callbackUrl;
        this.contractAddress = uportConfig.contractAddress;
        const web3Client = new Ethereum.Web3.EthereumWeb3Adapter(rpcUrl);
        this.ethereum = new Ethereum.EthereumReader(web3Client, contracts);
        this.auth = new AuthorizationManager();
        this.notary = new Sha256Notary();
        this.web3 = new EthereumWeb3Adapter(rpcUrl);

        this.tokens = {};
        this.packages_cache = {
        };

        this.txQueue = {};
    }

    public async LogStartup(): Promise<any> {
        winston.info(`Callback URL: ${this.callbackRoot}`);
        winston.info(`Contract Address: ${this.contractAddress}`);
    }

    public async InitializeLogin(): Promise<any> {
        return await this.auth.GenerateIdRequest();
    }

    public async GetLoginStatus(id: string): Promise<any> {
        const result = await this.auth.GetRequest(id);

        if (result.status === "Exists") {
            result.value = await this.uport.ReadToken(result.value);
        }

        return result;
    }

    public async GetApproveStatus(id: string): Promise<any> {
        const result = await this.auth.GetRequest(id);

        if (result.status === "Exists") {
            result.value = await this.uport.ReadToken(result.value);
        }

        return result;
    }

    public async GenerateServerLoginUri(jwToken: string): Promise<string> {
        return this.GenerateLoginUri(jwToken, "authorize");
    }

    public async GenerateClientLoginUri(jwToken: string): Promise<string> {
        return this.GenerateLoginUri(jwToken, "clientCallback.html");
    }

    private async GenerateLoginUri(jwToken: string, target: string): Promise<string> {
        return this.GenerateClaimsUri(`${this.callbackRoot}/${target}/${jwToken}`);
    }

    public async AuthorizeToken(id: string, token: string): Promise<any> {
        const data = await this.uport.ReadToken(token);
        await this.auth.RegisterToken(id, token);
        this.tokens[data.address] = data;
    }

    public async CreateContract(id: string) {
        const data = this.tokens[id];
        const uri = this.uport.GenerateFunctionCallUri(this.contractAddress, 'NewPackage', [{ type: 'bytes32', value: '0x01' }], `${this.callbackRoot}/attestregistration?address=${data.address}`);
        winston.info(`Notify ${data.name} to Create Contract`);
        await this.uport.Push(data.pushToken, data.publicEncKey, {
            url: uri
        });
    }

    public async RegisterTransfer(packageId: string, txHash: string, token: string) {
        const pkg = this.packages_cache[packageId];
        const data = this.tokens[pkg.currentOwner];

        const uri = this.uport.GenerateFunctionCallUri(pkg.contractAddress, 'AcceptTransferOwner', [{ type: 'address', value: `0x${packageId}` }], `${this.callbackRoot}?token=${token}`);
        winston.info(`Accept transfer to ${data.name}`);
        winston.debug(uri);
        await this.uport.Push(data.pushToken, data.publicEncKey, {
            url: uri
        });
    }


    public async RegisterNewPackage(id: string, packageData: any, token: any) {
        const data = this.tokens[id];

        const pkgobj = {
            packageId: '',
            productId: packageData.product_id,
            count: packageData.count,
            currentOwner: id,
            potentialOwner: null,
            state: 'Active',
            transaction: null,
            contractAddress: null
        };

        //ISSUE better to include timestamp or something to hash?
        pkgobj.packageId = this.notary.GetSignature(JSON.stringify(
            _.pick(pkgobj, ['productId', 'count', 'currentOwner', 'potentialOwner'])));

        //put packagedata on storage
        winston.debug(`Registering package ${pkgobj.packageId}`);
        this.packages_cache[pkgobj.packageId] = pkgobj;

        const uri = this.uport.GenerateFunctionCallUri(this.contractAddress, 'NewPackage', [{ type: 'bytes32', value: '0x' + pkgobj.packageId }], `${this.callbackRoot}/registerPackage/${pkgobj.packageId}?token=${token}`);
        // winston.info(`Notify ${data.name} to sign NewPackage TX`);
        await this.uport.Push(data.pushToken, data.publicEncKey, {
            url: uri
        });
    }

    public async RegisterTx(packageId: string, txHash: string): Promise<any> {
        if (!this.IsUnset(packageId)) {
            if (this.IsUnset(txHash)) {
                //Assume rejected transaction and remove package
                if (this.packages_cache[packageId].Transaction === undefined) {
                    winston.info(`Removing package ${packageId}`);
                    delete this.packages_cache[packageId];
                }
            }
            else {
                winston.info(`Registring tx ${txHash} package ${packageId}`);
                this.txQueue[txHash] = packageId;
            }
        }

        return new Promise<any>((resolve) => { resolve(); });
    }

    //TODO please implement transferPackage using transfer contract
    //TODO please amend using chache to  CosmosDB, if possible
    public async TransferPackage(id: string, pkgid: string) {
        winston.debug('say transfer package');

        const data = this.tokens[id];

        //temprary implementatioon
        const newpkg = JSON.parse(JSON.stringify(this.packages_cache[pkgid]));       //clone

        newpkg.potentialOwner = id;
        newpkg.status = 'Pending';
        newpkg.transaction = null;
        newpkg.contractAddress = null;
        newpkg.packageId = this.notary.GetSignature(JSON.stringify(
            _.pick(newpkg, ['productId', 'count', 'currentOwner', 'potentialOwner'])));

        //ISSU pending ??
        //After completed hand over, this should be 'Close'
        this.packages_cache[pkgid].status = 'Pending';

        //put packagedata on storage
        winston.debug(`Registering package ${newpkg.packageId}`);

        this.packages_cache[newpkg.packageId] = newpkg;

        winston.debug(newpkg);

        //////
        // ToDo send contract

        // const uri = this.uport.GenerateFunctionCallUri(this.contractAddress, 'NewPackage', [{ type: 'bytes32', value: '0x' + pkgobj.packageId }], `${this.callbackRoot}/registerPackage?packageId=${pkgobj.packageId}`);
        // winston.info(`Notify ${data.name} to sign NewPackage TX`);
        // await this.uport.Push(data.pushToken, data.publicEncKey, {
        //     url: uri
        // });
    }


    public async MonitorTxQueue(): Promise<any> {
        const toDequeue: Array<string> = [];

        for (const txHash in this.txQueue) {
            winston.info(`Watching ${txHash}`);
            const receipt = await this.web3.GetTransactionReceipt(txHash);

            if (receipt !== null && receipt.blockNumber) {
                winston.info(`Pushing TX for Package ${this.txQueue[txHash]}`);
                const packageId = this.txQueue[txHash];
                const pkg = this.packages_cache[packageId];
                //TODO if cosmos, plz change
                pkg.transaction = txHash;
                pkg.contractAddress = '0x' + this.GetContractAddress(receipt);
                toDequeue.push(txHash);
                winston.debug(pkg);
            }
        }

        for (const index in toDequeue) {
            const txHash = toDequeue[index];
            winston.debug(`Removing TX ${txHash}`);
            delete this.txQueue[txHash];
        }

        return Object.keys(this.txQueue).length !== 0;
    }

    public VerifyId(id: string): boolean {
        return this.tokens[id] !== undefined;
    }

    public GetContractAddress(txReceipt: any): string {
        return txReceipt.logs[0].data.substring(26);
    }

    //TODO if migrate COSMOS, should be modified
    public async ListPackages() {
        return Object.keys(this.packages_cache).map(key => this.packages_cache[key]);
    }


    //TODO if migrate COSMOS, should modified
    public async getPackageInfo(package_id: string): Promise<any> {
        winston.debug('Uapp get package info');
        winston.debug(package_id);
        winston.debug(this.packages_cache[package_id]);
        return this.packages_cache[package_id];
    }

    public IsUnset(item: any): boolean {
        return item === undefined || item === null || item === "";
    }

    public async Delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async GenerateQRCode(res: any, uri: string) {
        winston.debug('QRCode URI :' + uri);
        UI.GenerateQRCode(res, uri);
    }

    public async GenerateRequestOwnershipQRCode(packageId: string, res: any, token: any) {
        const pkg = this.packages_cache[packageId];
        winston.debug(pkg.constractAddress);
        const uri = this.uport.GenerateFunctionCallUri(pkg.contractAddress, 'RequestOwnership', [{ type: 'bytes32', value: '0x' + packageId }], `${this.callbackRoot}/registerTransfer?packageId=${packageId}%26token=${token}`);
        winston.debug('QRCode URI :' + uri);
        UI.GenerateQRCode(res, uri);
    }


    public async LoginQrCode(res: any, jwToken: string) {
        await this.GenerateQRCode(res, await this.GenerateServerLoginUri(jwToken));
    }

    private async GenerateClaimsUri(callbackUri: string): Promise<string> {
        return await this.uport.GenerateClaimsRequest(['name', 'devicekey'], `${callbackUri}`, new DateTime().AddDays(30).AsSeconds());
    }

    private static GetStorage(storageRoot: string, storageConfig: any): IStorage {
        let storage: IStorage;

        if (storageConfig.implementation === 'FileSystem') {
            storage = new FileSystemStorage(storageRoot);
        } else {
            storage = new AzureBlobStorage(storageConfig.azure.account, storageConfig.azure.key, storageRoot);
        }

        return storage;
    }
}
