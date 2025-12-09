import { Injectable, BadRequestException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { User } from './entities/user.entity';
import { EmailVerification } from './entities/email-verification.entity';
import { EmailRegisterDto } from './dto/email-register.dto';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { EmailLoginDto } from './dto/email-login.dto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  private transporter;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(EmailVerification)
    private emailVerificationRepository: Repository<EmailVerification>,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {
    // 配置邮件发送器
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || '',
      port: parseInt(process.env.MAIL_PORT || '0'),
      secure: true,
      auth: {
        user: process.env.MAIL_USER || '',
        pass: process.env.MAIL_PASS || '',
      },
    });
  }

  async sendVerificationCode(email: string) {
    // 生成6位验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 保存验证码
    const verification = this.emailVerificationRepository.create({
      email,
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15分钟有效期
    });
    await this.emailVerificationRepository.save(verification);

    // 发送验证码邮件
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: email,
      subject: '验证码',
      text: `您的验证码是：${code}，15分钟内有效。`,
    });
  }

  async registerWithEmail(registerDto: EmailRegisterDto) {
    // 验证验证码
    const verification = await this.emailVerificationRepository.findOne({
      where: {
        email: registerDto.email,
        code: registerDto.verificationCode,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!verification) {
      throw new BadRequestException('验证码无效或已过期');
    }

    // 检查邮箱是否已注册
    const existingUser = await this.usersRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('邮箱已被注册');
    }

    // 创建新用户
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = this.usersRepository.create({
      email: registerDto.email,
      password: hashedPassword,
      emailVerified: true,
    });

    await this.usersRepository.save(user);
    return user;
  }

  async bindWechat(userId: number, wechatData: { openId: string; unionId: string }) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    user.wechatOpenId = wechatData.openId;
    user.wechatUnionId = wechatData.unionId;
    return this.usersRepository.save(user);
  }

  async findOne(id: number) {
    return this.usersRepository.findOne({ where: { id } });
  }

  async loginWithEmail(loginDto: EmailLoginDto) {
    const user = await this.usersRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('密码错误');
    }

    // 注入 AuthService
    return this.authService.generateToken(user);
  }

  async loginWithWechat(code: string) {
    // 1. 通过 code 获取微信的 access_token
    const wxResponse = await this.getWechatToken(code);
    
    // 2. 获取用户信息
    const userInfo = await this.getWechatUserInfo(wxResponse.access_token, wxResponse.openid);
    
    // 3. 查找或创建用户
    let user = await this.usersRepository.findOne({
      where: [
        { wechatOpenId: userInfo.openid },
        { wechatUnionId: userInfo.unionid }
      ]
    });

    if (!user) {
      // 创建新用户
      user = this.usersRepository.create({
        wechatOpenId: userInfo.openid,
        wechatUnionId: userInfo.unionid,
        nickname: userInfo.nickname,
        avatar: userInfo.headimgurl,
      });
      await this.usersRepository.save(user);
    }

    // 修改返回值，使用 token
    return this.authService.generateToken(user);
  }

  private async getWechatToken(code: string) {
    const response = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${process.env.WECHAT_APP_ID}&secret=${process.env.WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`
    );
    const data = await response.json();
    
    if (data.errcode) {
      throw new BadRequestException('微信授权失败');
    }
    
    return data;
  }

  private async getWechatUserInfo(accessToken: string, openid: string) {
    const response = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessToken}&openid=${openid}`
    );
    const data = await response.json();
    
    if (data.errcode) {
      throw new BadRequestException('获取微信用户信息失败');
    }
    
    return data;
  }
} 