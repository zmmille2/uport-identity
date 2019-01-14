import winston = require('winston');

import * as Adapters from 'meeteric-js';

import { LoggingConfiguration } from 'meeteric-js';
import { IWeb3Adapter, Ethereum } from 'meeteric-js';
import { IBlockTracker, IIdentifier, INotary, IStorage, IEventBus } from 'meeteric-js';

import {
    AzureBlobStorage,
    FileSystemStorage,
    Sha256Notary,
    SigningNotary,
    GenericIdentifier,
    ServiceBusConfig,
    EventBusGroup,
    ConsoleEventBus,
    AzureServiceBusEventBus
} from 'meeteric-js';

import util = require('util');
import config = require('config');

class Program {
    public static async Run() {
        await Program.WatchChain(config.get('rpcUrl'), config.get('startingBlock'));
    }

    public static async WatchChain(rpcUrl: string, startingBlock: string) {
        LoggingConfiguration.initialize(null);

        const storageConfig = config.get('storage');
        const web3Client = new Ethereum.Web3.EthereumWeb3Adapter(rpcUrl);
        const networkId = await Ethereum.EthereumReader.GetIdentity(web3Client);
        const eventBus = Program.GetEventBus(new ServiceBusConfig(config.get('serviceBus')));
        const chiainStorage = Program.GetChainStorage(storageConfig, networkId);
        const constractStorage = Program.GetContractStorage(storageConfig);
        const fsCache = new Ethereum.Web3.EthereumWeb3AdapterStorageCache(web3Client, chiainStorage);
        const ethClient = new Ethereum.EthereumReader(fsCache, constractStorage);

        if (startingBlock.length === 0) {
            startingBlock = 'latest';
        }
        const blockNumber = (await fsCache.GetBlock(startingBlock)).number;
        const blockTracker = new Ethereum.EthereumBlockTracker(chiainStorage, blockNumber);
        new Ethereum.EthereumWatcher(ethClient, eventBus, blockTracker)
            .Monitor()
            .catch(err => winston.error(err));
    }

    private static GetEventBus(serviceBusConfig: ServiceBusConfig): IEventBus {
        const eventBus = new EventBusGroup();
        eventBus.AddEventBus(new ConsoleEventBus());

        if (serviceBusConfig.IsValid()) {
            eventBus.AddEventBus(new AzureServiceBusEventBus(serviceBusConfig));
        }

        return eventBus;
    }

    private static GetChainStorage(storageConfig: any, networkId: IIdentifier): FileSystemStorage {
        const chainRoot = `${storageConfig.root}/${networkId.AsString()}`;
        return new FileSystemStorage(chainRoot);
    }

    private static GetContractStorage(storageConfig: any): IStorage {
        const chainRoot = `${storageConfig.root}/Contracts`;
        return Program.GetStorage(chainRoot, storageConfig);
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

Program.Run()
    .catch(err => winston.error(err));
