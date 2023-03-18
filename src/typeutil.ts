type ConstructorOf<Args extends readonly unknown[], R> = new (...args: Args) => R; 

const constructorToLambda = <Args extends readonly unknown[], R>(
  constructor: ConstructorOf<Args, R>) => {
  return (...args: Args): R => new constructor(...args);
};

