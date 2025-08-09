import fetch, { Headers } from "node-fetch";
import type { RequestInit } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";

interface Options {
    reqURL: string;
    authorization: string;
    method: "GET" | "POST";
    body?: string;
    proxy?: {
        host: string;
        port: number;
        auth?: {
            username: string;
            password: string;
        };
    };
}

const defaultHeaders = new Headers({
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "text/plain;charset=UTF-8",
    dnt: "1",
    origin: "https://labs.google",
    priority: "u=1, i",
    referer: "https://labs.google/",
    "sec-ch-ua":
        '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
});

const request = async (options: Options, headers: Headers = defaultHeaders) => {
    if (!options.authorization.startsWith("Bearer")) {
        options.authorization = "Bearer " + options.authorization;
    }

    headers.set("authorization", options.authorization);

    const fetchOptions: RequestInit = {
        headers,
        method: options.method,
        body: options.body,
    };

    if (options.proxy) {
        const proxyUrl = new URL(`http://${options.proxy.host}:${options.proxy.port}`);
        if (options.proxy.auth) {
            proxyUrl.username = options.proxy.auth.username;
            proxyUrl.password = options.proxy.auth.password;
        }
        fetchOptions.agent = new HttpsProxyAgent(proxyUrl.toString());
    }

    return fetch(options.reqURL, fetchOptions);
};

export default request;