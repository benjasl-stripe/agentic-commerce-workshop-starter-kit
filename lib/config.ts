export interface Config {
  lambdaEndpoint: string;
  workshopSecret: string;
}

export function getConfig(): Config {
  if (typeof window === 'undefined') {
    return {
      lambdaEndpoint: '',
      workshopSecret: '',
    };
  }

  return {
    lambdaEndpoint: localStorage.getItem('lambdaEndpoint') || '',
    workshopSecret: localStorage.getItem('workshopSecret') || '',
  };
}

export function saveConfig(config: Config): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem('lambdaEndpoint', config.lambdaEndpoint);
  localStorage.setItem('workshopSecret', config.workshopSecret);
}

