export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = 'not found') => new AppError(404, message);
export const badRequest = (message: string) => new AppError(400, message);
export const unauthorized = (message = 'unauthorized') => new AppError(401, message);
export const forbidden = (message = 'forbidden') => new AppError(403, message);
export const conflict = (message: string) => new AppError(409, message);
