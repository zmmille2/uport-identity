import jwt = require('jsonwebtoken');
import winston = require('winston');
import { DateTime } from './';

export class Tokens {
    private readonly secret: string;

    public constructor(secret: string) {
        this.secret = secret;
    }

    public async Sign(claims: any, expires?: DateTime): Promise<string> {
        expires = expires || new DateTime().AddMinutes(5);
        return new Promise<string>((resolve) => {
            claims.exp = expires.AsSeconds();
            resolve(jwt.sign(claims, this.secret));
        });
    }

    public async Read(token: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            try {
                resolve(jwt.verify(token, this.secret));
            } catch (err) {
                reject(err);
            }
        });
    }
}