import { fixture } from '@open-wc/testing';

export const renderHelper = <T extends keyof HTMLElementTagNameMap>(tag: T) => {
  return (props: Record<string, any> = {}, children?: string) => {
    const attrs = Object.entries(props)
      .reduce((acc, [key, value]) => [...acc, `${key}=${value}`], [] as string[])
      .join(' ');
    return fixture<HTMLElementTagNameMap[T]>(`<${tag} ${attrs}>${children}</${tag}>`);
  };
};