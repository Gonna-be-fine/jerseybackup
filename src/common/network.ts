import { Logger } from '@nestjs/common';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const logger = new Logger('Network');

export function configureGlobalFetchProxy() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) {
    logger.warn('Global fetch proxy is not configured. Set HTTPS_PROXY or HTTP_PROXY if Gemini is unreachable directly.');
    return;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  logger.log(`Global fetch proxy enabled: ${maskProxyUrl(proxyUrl)}`);
}

function maskProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return proxyUrl;
  }
}
