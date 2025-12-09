import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

  async generateToken(user: User) {
    const payload = { 
      sub: user.id,
      email: user.email,
      wechatOpenId: user.wechatOpenId 
    };
    
    const token = this.jwtService.sign(payload);
    const decodedToken = this.jwtService.decode(token) as { exp: number };
    
    return {
      access_token: token,
      expires_in: decodedToken.exp * 1000, // 转换为毫秒时间戳
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    };
  }
} 
