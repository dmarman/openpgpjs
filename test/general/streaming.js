const openpgp = typeof window !== 'undefined' && window.openpgp ? window.openpgp : require('../../dist/openpgp');

const stub = require('sinon/lib/sinon/stub');
const chai = require('chai');
chai.use(require('chai-as-promised'));

const { expect } = chai;

const { util } = openpgp;

describe('Streaming', function() {
  it('Encrypt small message', async function() {
    const data = new ReadableStream({
      async start(controller) {
        controller.enqueue(util.str_to_Uint8Array('hello '));
        controller.enqueue(util.str_to_Uint8Array('world'));
        controller.close();
      }
    });
    const encrypted = await openpgp.encrypt({
      data,
      passwords: ['test'],
    });
    const msgAsciiArmored = await openpgp.stream.readToEnd(encrypted.data);
    const message = await openpgp.message.readArmored(msgAsciiArmored);
    const decrypted = await openpgp.decrypt({
      passwords: ['test'],
      message
    });
    expect(decrypted.data).to.equal('hello world');
  });

  it('Encrypt larger message', async function() {
    let plaintext = [];
    let i = 0;
    const data = new ReadableStream({
      async pull(controller) {
        if (i++ < 10) {
          let randomBytes = await openpgp.crypto.random.getRandomBytes(1024);
          controller.enqueue(randomBytes);
          plaintext.push(randomBytes);
        } else {
          controller.close();
        }
      }
    });
    const encrypted = await openpgp.encrypt({
      data,
      passwords: ['test'],
    });
    await openpgp.stream.getReader(openpgp.stream.clone(encrypted.data)).readBytes(1000);
    if (i > 10) throw new Error('Data did not arrive early.');
    const msgAsciiArmored = await openpgp.stream.readToEnd(encrypted.data);
    const message = await openpgp.message.readArmored(msgAsciiArmored);
    const decrypted = await openpgp.decrypt({
      passwords: ['test'],
      message,
      format: 'binary'
    });
    expect(decrypted.data).to.deep.equal(util.concatUint8Array(plaintext));
  });

  it('Encrypt and decrypt larger message roundtrip', async function() {
    let plaintext = [];
    let i = 0;
    const data = new ReadableStream({
      async pull(controller) {
        if (i++ < 10) {
          let randomBytes = await openpgp.crypto.random.getRandomBytes(1024);
          controller.enqueue(randomBytes);
          plaintext.push(randomBytes);
        } else {
          controller.close();
        }
      }
    });
    const encrypted = await openpgp.encrypt({
      data,
      passwords: ['test'],
    });

    const msgAsciiArmored = encrypted.data;
    const message = await openpgp.message.readArmored(msgAsciiArmored);
    const decrypted = await openpgp.decrypt({
      passwords: ['test'],
      message,
      format: 'binary'
    });
    expect(util.isStream(decrypted.data)).to.be.true;
    expect(await openpgp.stream.readToEnd(decrypted.data)).to.deep.equal(util.concatUint8Array(plaintext));
  });

  it('Encrypt and decrypt larger message roundtrip (draft04)', async function() {
    let aead_protectValue = openpgp.config.aead_protect;
    let aead_chunk_size_byteValue = openpgp.config.aead_chunk_size_byte;
    openpgp.config.aead_protect = true;
    openpgp.config.aead_chunk_size_byte = 4;
    try {
      let plaintext = [];
      let i = 0;
      const data = new ReadableStream({
        async pull(controller) {
          await new Promise(setTimeout);
          if (i++ < 10) {
            let randomBytes = await openpgp.crypto.random.getRandomBytes(1024);
            controller.enqueue(randomBytes);
            plaintext.push(randomBytes);
          } else {
            controller.close();
          }
        }
      });
      const encrypted = await openpgp.encrypt({
        data,
        passwords: ['test'],
      });

      const msgAsciiArmored = encrypted.data;
      const message = await openpgp.message.readArmored(msgAsciiArmored);
      const decrypted = await openpgp.decrypt({
        passwords: ['test'],
        message,
        format: 'binary'
      });
      expect(util.isStream(decrypted.data)).to.be.true;
      await openpgp.stream.getReader(openpgp.stream.clone(decrypted.data)).readBytes(1000);
      if (i > 10) throw new Error('Data did not arrive early.');
      expect(await openpgp.stream.readToEnd(decrypted.data)).to.deep.equal(util.concatUint8Array(plaintext));
    } finally {
      openpgp.config.aead_protect = aead_protectValue;
      openpgp.config.aead_chunk_size_byte = aead_chunk_size_byteValue;
    }
  });
});
