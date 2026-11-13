/**
 * Thrown by every function you still have to write.
 * The app catches it in a few places (e.g. the camera) and falls back to a
 * placeholder, so the starter runs before you have implemented anything.
 * The unit tests report it as a failure with the function's name.
 */
export class NotImplemented extends Error {
  constructor(name) {
    super(`TODO: implement ${name}`);
    this.name = 'NotImplemented';
  }
}

export function todo(name) {
  throw new NotImplemented(name);
}
