/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';

import expect = require('expect.js');

import {
  IFactory, Lifetime, Token, isRegistered, register, resolve
} from '../../lib/index';


interface IBar {
  bar: number;
}


interface IFoo {
  foo: string;
}


const IBar = new Token<IBar>('my-package.IBar');

const IFoo = new Token<IFoo>('my-package.IFoo');

const IBaz = new Token<string>('my-package.IBaz');


let barFactory: IFactory<IBar> = {
  requires: [],
  create: () => {
    return { bar: 42 };
  }
}


class Foo implements IFoo {

  static requires = [IBar];

  static lifetime = Lifetime.Transient;

  constructor(bar: IBar) {
    this._bar = bar;
  }

  get foo(): string {
    return '' + this._bar.bar;
  }

  private _bar: IBar;
}


let bazFactory: IFactory<string> = {
  requires: [IBaz],
  create: function() {
    return 'hello from baz';
  }
}


describe('phosphor-di', () => {

  describe('Token', () => {

    describe('#constructor()', () => {

      it('should take a string argument', () => {
        let t = new Token('test_constructor');
        expect(t instanceof Token).to.be(true);
      });

    });

    describe('#name', () => {

      it('should get the name of the token', () => {
        let t = new Token('test_name');
        expect(t.name).to.be('test_name');
      });

      it('should be read only', () => {
        let t = new Token('test_name_readonly');
        expect(() => { t.name = 'bar'; }).to.throwError();
      });

    });

  });

  describe('isRegistered()', () => {

    it('should test whether a function is registered', () => {
      let t = new Token('test_is_registered');
      expect(isRegistered(t)).to.be(false);
      register(t, {
        requires: [],
        create: () => {
          return 'hello';
        },
      });
      expect(isRegistered(t)).to.be(true);
    });

  });

  describe('register()', () => {

    it('should register a type mapping for the specified token', () => {
      let t = new Token('test_register');
      register(t, Foo);
      expect(isRegistered(t)).to.be(true);
    });

    it('should ignore a token that is already registered', () => {
      let t = new Token<string>('test_register_duplicate');
      let factory: IFactory<string> = {
        requires: [],
        create: () => {
          return 'hello';
        },
      }
      register(t, factory);
      register(t, factory);
    });

    it('should ignore a circular dependency', () => {
      register(IBaz, bazFactory);
    });

  });

  describe('register()', () => {

    it('should resolve an instance for a given token', (done) => {
      register(IFoo, Foo);
      register(IBar, barFactory);
      resolve(IFoo).then(value => {
        expect(value.foo).to.be('42');
        done();
      });
    });

    it('should resolve an instance for a given provider', (done) => {
      register(IFoo, Foo);
      register(IBar, barFactory);
      resolve(Foo).then(value => {
        expect(value.foo).to.be('42');
        done();
      });
    });

    it('should resolve an instance for a given provider', (done) => {
      register(IFoo, Foo);
      register(IBar, barFactory);
      resolve(Foo).then(value => {
        expect(value.foo).to.be('42');
        done();
      });
    });

    it('should reject if it fails on a token', (done) => {
      resolve(IBaz).catch(error => {
        expect(error.message.indexOf("Unregistered token")).to.not.be(-1);
        done();
      });
    });

    it('should reject if it fails on a provider', (done) => {
      resolve(bazFactory).catch(error => {
        expect(error.message.indexOf("Unregistered token")).to.not.be(-1);
        done();
      });
    });

  });

});
