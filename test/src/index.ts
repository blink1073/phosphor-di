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
  Container, IFactory, Lifetime, Token
} from '../../lib/index';


interface IFoo {
  foo: string;
}


interface IBar {
  bar: number;
}


const IFoo = new Token<IFoo>('my-package.IFoo');

const IBar = new Token<IBar>('my-package.IBar');

const IBaz = new Token<string>('my-package.IBaz');


class Foo implements IFoo {

  static lifetime = Lifetime.Transient;

  static requires = [IBar];

  static create(bar: IBar): IFoo {
    return new Foo(bar);
  }

  constructor(bar: IBar) {
    this._bar = bar;
  }

  get foo(): string {
    return '' + this._bar.bar;
  }

  private _bar: IBar;
}


let barFactory: IFactory<IBar> = {
  requires: [],
  create: () => ({ bar: 42 }),
}


let bazFactory: IFactory<string> = {
  requires: [IBaz],
  create: () => 'baz',
}


describe('phosphor-di', () => {

  describe('Token', () => {

    describe('#constructor()', () => {

      it('should take a string argument', () => {
        let t = new Token('test-constructor');
        expect(t instanceof Token).to.be(true);
      });

    });

    describe('#name', () => {

      it('should get the name of the token', () => {
        let t = new Token('test-name');
        expect(t.name).to.be('test-name');
      });

      it('should be read only', () => {
        let t = new Token('test-name-readonly');
        expect(() => { t.name = 'bar'; }).to.throwError();
      });

    });

  });

  describe('Container', () => {

    describe('#isRegistered()', () => {

      it('should test whether a token is registered', () => {
        let c = new Container();
        let t = new Token<string>('test-is-registered');
        expect(c.isRegistered(t)).to.be(false);
        c.register(t, { requires: [], create: () => 'hello' });
        expect(c.isRegistered(t)).to.be(true);
      });

    });

    describe('#register()', () => {

      it('should register a type mapping for the specified token', () => {
        let c = new Container();
        let t = new Token<IFoo>('test-register');
        c.register(t, Foo);
        expect(c.isRegistered(t)).to.be(true);
      });

      it('should ignore a token that is already registered', () => {
        let c = new Container();
        let t = new Token<string>('test-register-duplicate');
        let factory: IFactory<string> = { requires: [], create: () => 'hello' };
        c.register(t, factory);
        c.register(t, factory);
      });

      it('should ignore a circular dependency', () => {
        let c = new Container();
        c.register(IBaz, bazFactory);
      });

    });

    describe('#resolve()', () => {

      it('should resolve an instance for a given token', (done) => {
        let c = new Container();
        c.register(IFoo, Foo);
        c.register(IBar, barFactory);
        c.resolve(IFoo).then(value => {
          expect(value.foo).to.be('42');
          done();
        });
      });

      it('should resolve an instance for a given factory', (done) => {
        let c = new Container();
        c.register(IFoo, Foo);
        c.register(IBar, barFactory);
        c.resolve(Foo).then(value => {
          expect(value.foo).to.be('42');
          done();
        });
      });

      it('should reject if it fails on a token', (done) => {
        let c = new Container();
        c.resolve(IBaz).catch(error => { done(); });
      });

      it('should reject if it fails on a factory', (done) => {
        let c = new Container();
        c.resolve(bazFactory).catch(error => { done(); });
      });

    });

  });

});
