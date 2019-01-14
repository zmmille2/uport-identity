import winston = require('winston');
import qr = require('qr-image');

export class UI {
    public static GenerateQRCode(res: any, uri: string) {
        const code = qr.image(uri, { type: 'svg' });
        winston.debug(uri);
        res.type('svg');
        code.pipe(res);
    }
}