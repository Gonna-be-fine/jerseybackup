export interface Response<T = any> {
  status: number;
  message: string;
  data?: T;
} 