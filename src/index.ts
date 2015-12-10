/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use strict';


/**
 * An enum which defines the registration lifetime policies.
 */
export
enum Lifetime {
  /**
   * A single instance is created and shared among all consumers.
   */
  Singleton,

  /**
   * A new instance is created each time one is requested.
   */
  Transient,
}


/**
 * A run-time token object which holds compile-time type information.
 */
export
class Token<T> {
  /**
   * Construct a new token object.
   *
   * @param name - A human readable name for the token.
   */
  constructor(name: string) {
    this._name = name;
  }

  /**
   * Get the human readable name for the token.
   *
   * #### Note
   * This is a read-only property.
   */
  get name(): string {
    return this._name;
  }

  private _name: string;
  private _tokenStructuralPropertyT: T;
}


/**
 * A class which declares its dependencies.
 */
export
interface IInjectable<T> {
  /**
   * The lifetime policy for the registration.
   *
   * The default value is `Lifetime.Singleton`.
   */
  lifetime?: Lifetime;

  /**
   * The dependencies required to instantiate the class.
   */
  requires: Token<any>[];

  /**
   * Create a new instance of the type.
   *
   * @param args - The resolved dependencies specified by `requires`.
   *
   * @returns A new instance of the type.
   */
  new(...args: any[]): T;
}


/**
 * A factory object which declares its dependencies.
 */
export
interface IFactory<T> {
  /**
   * The lifetime policy for the registration.
   *
   * The default value is `Lifetime.Singleton`.
   */
  lifetime?: Lifetime;

  /**
   * The dependencies required to create the instance.
   */
  requires: Token<any>[];

  /**
   * Create a new instance of the type.
   *
   * @param args - The resolved dependencies specified by `requires`.
   *
   * @returns A new instance of the type, or a Promise to an instance.
   */
  create(...args: any[]): T | Promise<T>;
}


/**
 * A type alias for a provider object.
 */
export
type Provider<T> = IInjectable<T> | IFactory<T>;


/**
 * Test whether a token is registered.
 *
 * @param token - The run-time type token of interest.
 *
 * @returns `true` if the token is registered, `false` otherwise.
 */
export
function isRegistered<T>(token: Token<T>): boolean {
  return registry.has(token);
}


/**
 * Register a type mapping for the specified token.
 *
 * @param token - The run-time type token of interest.
 *
 * @param provider - The object which will create the instance.
 *
 * #### Notes
 * If the token is already registered, or if registering the provider
 * would cause a circular dependency, an error will be logged to the
 * console and the registration will be ignored.
 */
export
function register<T>(token: Token<T>, provider: Provider<T>): void {
  if (checkRegistered(token)) return;
  if (checkCyclic(token, provider)) return;
  registry.set(token, createResolver(provider));
}


/**
 * Resolve an instance for the given token or provider.
 *
 * @param value - The token or provider object to resolve.
 *
 * @returns A promise which resolves to an instance of the requested
 *   type, or rejects if the instance fails to resolve for any reason.
 */
export
function resolve<T>(value: Token<T> | Provider<T>): Promise<T> {
  let result: T | Promise<T>;
  if (value instanceof Token) {
    result = resolveToken(value as Token<T>);
  } else {
    result = resolveProvider(value as Provider<T>);
  }
  return Promise.resolve(result);
}


/**
 * An object which manages the resolution of a provider.
 */
interface IResolver<T> {
  /**
   * The provider managed by the resolver.
   */
  provider: Provider<T>;

  /**
   * Resolve an instance of the type from the provider.
   */
  resolve(): T | Promise<T>;
}


/**
 * The internal registry mapping tokens to resolvers.
 */
var registry = new Map<Token<any>, IResolver<any>>();


/**
 * Check and log an error if the token is registered.
 */
function checkRegistered<T>(token: Token<T>): boolean {
  if (!registry.has(token)) return false;
  console.error(`Token '${token.name}' is already registered.`);
  return true;
}


/**
 * Check and log an error if the provider causes a cycle.
 */
function checkCyclic<T>(token: Token<T>, provider: Provider<T>): boolean {
  let cycle = findCycle(token, provider);
  if (cycle.length === 0) return false;
  let path = cycle.map(token => `'${token.name}'`).join(' -> ');
  console.error(`Cycle detected: '${token.name}' -> ${path}.`);
  return true;
}


/**
 * Find a potential cycle in the registry from the given token.
 *
 * This returns an array of tokens which traces the path of the cycle.
 * The given token is the implicit start of the cycle. If no cycle is
 * present, the array will be empty.
 */
function findCycle<T>(token: Token<T>, provider: Provider<T>): Token<any>[] {
  let trace: Token<any>[] = [];
  visit(provider);
  return trace;

  function visit(value: Provider<any>): boolean {
    for (let other of value.requires) {
      trace.push(other);
      if (other === token) {
        return true;
      }
      let resolver = registry.get(other);
      if (resolver && visit(resolver.provider)) {
        return true;
      }
      trace.pop();
    }
    return false;
  }
}


/**
 * Create a rejected promise which indicates the token is unregistered.
 */
function rejectToken<T>(token: Token<T>): Promise<T> {
  return Promise.reject(new Error(`Unregistered token: '${token.name}'.`));
}


/**
 * Resolve the given token.
 */
function resolveToken<T>(token: Token<T>): T | Promise<T> {
  let result: T | Promise<T>;
  let resolver = registry.get(token);
  if (resolver) {
    result = resolver.resolve();
  } else {
    result = rejectToken(token);
  }
  return result;
}


/**
 * Resolve the given provider.
 */
function resolveProvider<T>(provider: Provider<T>): Promise<T> {
  let result: Promise<T>;
  if (typeof provider === 'function') {
    result = resolveInjectable(provider as IInjectable<T>);
  } else {
    result = resolveFactory(provider as IFactory<T>);
  }
  return result;
}


/**
 * Resolve the given injectable.
 */
function resolveInjectable<T>(injectable: IInjectable<T>): Promise<T> {
  let promises = injectable.requires.map(resolveToken);
  return Promise.all(promises).then(dependencies => {
    let instance = Object.create(injectable.prototype);
    return injectable.apply(instance, dependencies) || instance;
  });
}


/**
 * Resolve the given factory.
 */
function resolveFactory<T>(factory: IFactory<T>): Promise<T> {
  let promises = factory.requires.map(resolveToken);
  return Promise.all(promises).then(dependencies => {
    return factory.create.apply(factory, dependencies);
  });
}


/**
 * Create a resolver for the given provider and options.
 */
function createResolver<T>(provider: Provider<T>): IResolver<T> {
  let result: IResolver<T>;
  if (provider.lifetime === Lifetime.Transient) {
    result = new TransientResolver(provider);
  } else {
    result = new SingletonResolver(provider);
  }
  return result;
}


/**
 * A resolver which implements the transient lifetime behavior.
 */
class TransientResolver<T> implements IResolver<T> {
  /**
   * Construct a new transient resolver.
   */
  constructor(provider: Provider<T>) {
    this._provider = provider;
  }

  /**
   * The provider managed by the resolver.
   */
  get provider(): Provider<T> {
    return this._provider;
  }

  /**
   * Resolve an instance of the type from the provider.
   */
  resolve(): T | Promise<T> {
    return resolveProvider(this._provider);
  }

  private _provider: Provider<T>;
}


/**
 * A resolver which implements the singleton lifetime behavior.
 */
class SingletonResolver<T> implements IResolver<T> {
  /**
   * Construct a new transient resolver.
   */
  constructor(provider: Provider<T>) {
    this._provider = provider;
  }

  /**
   * The provider managed by the resolver.
   */
  get provider(): Provider<T> {
    return this._provider;
  }

  /**
   * Resolve an instance of the type from the provider.
   */
  resolve(): T | Promise<T> {
    if (this._resolved) {
      return this._value;
    }
    if (this._promise) {
      return this._promise;
    }
    let promise = resolveProvider(this._provider).then(value => {
      this._value = value;
      this._promise = null;
      this._resolved = true;
      return value;
    }, error => {
      this._promise = null;
      throw error;
    });
    return this._promise = promise;
  }

  private _value: T = null;
  private _resolved = false;
  private _provider: Provider<T>;
  private _promise: Promise<T> = null;
}
