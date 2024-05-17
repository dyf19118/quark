import {
    QuarkElement,
    customElement,
} from "../../src/main"

const tag = 'hello-world';

declare global {
  interface HTMLElementTagNameMap {
    [tag]: HelloWorld;
  }
}

@customElement({ tag, style: '.test { color: rgb(136, 170, 255); font-size: 24px; }' })
class HelloWorld extends QuarkElement {
  #wo = ['w', 'o'];

  render() {
    return <div className="test">hello, {this.#wo}rld!</div>;
  }
}
