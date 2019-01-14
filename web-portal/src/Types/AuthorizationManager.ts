import winston = require('winston');

export class AuthorizationManager {
    private activeRequests: any;

    public constructor() {
        this.activeRequests = {};
    }

    public async GenerateIdRequest(): Promise<any> {
        return new Promise<any>((resolve) => {
            const request = {
                id: this.GenerateId()
            };
            this.activeRequests[request.id] = "1";
            resolve(request);
        });
    }

    public async GetRequest(id: string): Promise<any> {
        return new Promise<any>((resolve) => {
            const result = {
                status: "NotExists",
                value: ""
            };

            const token = this.activeRequests[id];

            if (token !== undefined) {
                result.status = "Pending";

                if (token.length > 1) {
                    result.value = token;
                    result.status = "Exists";
                }
            }

            resolve(result);
        });
    }

    public async RegisterToken(id: string, token: string): Promise<any> {
        return new Promise<any>((resolve) => {
            const request = this.activeRequests[id];
            if (request === "1") {
                this.activeRequests[id] = token;
            }
            resolve();
        });
    }
    private s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    private GenerateId(): string {
        return this.s4() + this.s4() + '-' + this.s4() + '-' + this.s4() + '-' +
            this.s4() + '-' + this.s4() + this.s4() + this.s4();
    }
}