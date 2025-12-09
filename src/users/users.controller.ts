import { Controller, Post, Body, UseGuards, Req, Get, Query, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('email/send-code')
  async sendVerificationCode(@Body('email') email: string) {
    await this.usersService.sendVerificationCode(email);
    return { message: '验证码已发送' };
  }

  @Post('email/register')
  async registerWithEmail(@Body() registerDto: EmailRegisterDto) {
    return this.usersService.registerWithEmail(registerDto);
  }

  @Post('login/email')
  async loginWithEmail(@Body() loginDto: EmailLoginDto) {
    return this.usersService.loginWithEmail(loginDto);
  }

  @Get('login/wechat')
  async loginWithWechat(@Query('code') code: string) {
    return this.usersService.loginWithWechat(code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
} 