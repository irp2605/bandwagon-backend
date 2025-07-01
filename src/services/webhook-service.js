import { Webhook } from "svix";

export const verifyWebhook = (body, headers, secret) => {
    const webhook = new Webhook(secret);
    return webhook.verify(JSON.stringify(body), headers);
}