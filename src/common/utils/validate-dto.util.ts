import { plainToInstance } from 'class-transformer';
import { validate, ValidatorOptions } from 'class-validator';

export class DtoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DtoValidationError';
  }
}

export async function validateDto<T extends object>(
  cls: new () => T,
  payload: unknown,
  options?: ValidatorOptions,
): Promise<T> {
  const instance = plainToInstance(cls, payload ?? {});

  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
    ...options,
  });

  if (errors.length > 0) {
    const message = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join(', ');
    throw new DtoValidationError(message || 'Invalid payload!');
  }

  return instance;
}
