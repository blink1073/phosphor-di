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
 * A factory which declares its dependencies.
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
 * A lightweight dependency injection container.
 */
export
class Container {
  /**
   * Test whether a token is registered with the container.
   *
   * @param token - The run-time type token of interest.
   *
   * @returns `true` if the token is registered, `false` otherwise.
   */
  isRegistered(token: Token<any>): boolean {
    return this._registry.has(token);
  }

  /**
   * Register a type mapping for the specified token.
   *
   * @param token - The run-time type token of interest.
   *
   * @param factory - The factory which will create the instance.
   *
   * #### Notes
   * If the token is already registered, or if registering the factory
   * would cause a circular dependency, an error will be logged to the
   * console and the registration will be ignored.
   */
  register<T>(token: Token<T>, factory: IFactory<T>): void {
    if (this._registry.has(token)) {
      logRegisterError(token);
      return;
    }
    let cycle = findCycle(this._registry, token, factory);
    if (cycle.length > 0) {
      logCycleError(token, cycle);
      return;
    }
    this._registry.set(token, createResolver(factory));
  }

  /**
   * Resolve an instance for the given token or factory.
   *
   * @param value - The token or factory object to resolve.
   *
   * @returns A promise which resolves to an instance of the requested
   *   type, or rejects with an error if an instance fails to resolve.
   */
  resolve<T>(value: Token<T> | IFactory<T>): Promise<T> {
    let result: T | Promise<T>;
    if (value instanceof Token) {
      result = resolveToken(this._registry, value as Token<T>);
    } else {
      result = resolveFactory(this._registry, value as IFactory<T>);
    }
    return Promise.resolve(result);
  }

  private _registry = createRegistry();
}


/**
 * An object which manages the resolution of a factory.
 */
interface IResolver<T> {
  /**
   * The factory managed by the resolver.
   */
  factory: IFactory<T>;

  /**
   * Resolve an instance of the type from the factory.
   */
  resolve(registry: Registry): T | Promise<T>;
}


/**
 * A type alias for a resolver registry map.
 */
type Registry = Map<Token<any>, IResolver<any>>;


/**
 * Create a new registry instance.
 */
function createRegistry(): Registry {
  return new Map<Token<any>, IResolver<any>>();
}


/**
 * Log an error which indicates a token is already registered.
 */
function logRegisterError(token: Token<any>): void {
  console.error(`Token '${token.name}' is already registered.`);
}


/**
 * Log an error which indicates a cycle was detected.
 */
function logCycleError(token: Token<any>, cycle: Token<any>[]): void {
  let path = cycle.map(token => `'${token.name}'`).join(' -> ');
  console.error(`Cycle detected: '${token.name}' -> ${path}.`);
}


/**
 * Create a rejected promise which indicates the token is unregistered.
 */
function rejectUnregistered(token: Token<any>): Promise<any> {
  return Promise.reject(new Error(`Unregistered token: '${token.name}'.`));
}


/**
 * Find a potential cycle in the registry from the given token.
 *
 * This returns an array of tokens which traces the path of the cycle.
 * The given token is the implicit start of the cycle. If no cycle is
 * present, the array will be empty.
 */
function findCycle<T>(registry: Registry, token: Token<T>, factory: IFactory<T>): Token<any>[] {
  let trace: Token<any>[] = [];
  visit(factory);
  return trace;

  function visit(factory: IFactory<any>): boolean {
    for (let other of factory.requires) {
      trace.push(other);
      if (other === token) {
        return true;
      }
      let resolver = registry.get(other);
      if (resolver && visit(resolver.factory)) {
        return true;
      }
      trace.pop();
    }
    return false;
  }
}


/**
 * Resolve a token using the specified registry.
 */
function resolveToken<T>(registry: Registry, token: Token<T>): T | Promise<T> {
  let result: T | Promise<T>;
  let resolver = registry.get(token) as IResolver<T>;
  if (resolver) {
    result = resolver.resolve(registry);
  } else {
    result = rejectUnregistered(token);
  }
  return result;
}


/**
 * Resolve a factory using the specified registry.
 */
function resolveFactory<T>(registry: Registry, factory: IFactory<T>): Promise<T> {
  let promises = factory.requires.map(token => resolveToken(registry, token));
  return Promise.all(promises).then(dependencies => {
    return factory.create.apply(factory, dependencies);
  });
}


/**
 * Create a resolver for the given factory.
 */
function createResolver<T>(factory: IFactory<T>): IResolver<T> {
  let result: IResolver<T>;
  if (factory.lifetime === Lifetime.Transient) {
    result = new TransientResolver(factory);
  } else {
    result = new SingletonResolver(factory);
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
  constructor(factory: IFactory<T>) {
    this._factory = factory;
  }

  /**
   * The factory managed by the resolver.
   */
  get factory(): IFactory<T> {
    return this._factory;
  }

  /**
   * Resolve an instance of the type from the factory.
   */
  resolve(registry: Registry): T | Promise<T> {
    return resolveFactory(registry, this._factory);
  }

  private _factory: IFactory<T>;
}


/**
 * A resolver which implements the singleton lifetime behavior.
 */
class SingletonResolver<T> implements IResolver<T> {
  /**
   * Construct a new transient resolver.
   */
  constructor(factory: IFactory<T>) {
    this._factory = factory;
  }

  /**
   * The factory managed by the resolver.
   */
  get factory(): IFactory<T> {
    return this._factory;
  }

  /**
   * Resolve an instance of the type from the factory.
   */
  resolve(registry: Registry): T | Promise<T> {
    if (this._resolved) {
      return this._value;
    }
    if (this._promise) {
      return this._promise;
    }
    this._promise = resolveFactory(registry, this._factory).then(value => {
      this._value = value;
      this._promise = null;
      this._resolved = true;
      return value;
    }, error => {
      this._promise = null;
      throw error;
    });
    return this._promise;
  }

  private _value: T = null;
  private _resolved = false;
  private _factory: IFactory<T>;
  private _promise: Promise<T> = null;
}
