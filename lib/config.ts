export interface Config {
  lambdaEndpoint: string;
  workshopSecret: string;
  productsApiUrl: string;
}

export function getConfig(): Config {
  if (typeof window === 'undefined') {
    return {
      lambdaEndpoint: '',
      workshopSecret: '',
      productsApiUrl: '',
    };
  }

  return {
    lambdaEndpoint: localStorage.getItem('lambdaEndpoint') || '',
    workshopSecret: localStorage.getItem('workshopSecret') || '',
    productsApiUrl: localStorage.getItem('productsApiUrl') || '',
  };
}

export function saveConfig(config: Config): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('lambdaEndpoint', config.lambdaEndpoint);
  localStorage.setItem('workshopSecret', config.workshopSecret);
  localStorage.setItem('productsApiUrl', config.productsApiUrl);
}

