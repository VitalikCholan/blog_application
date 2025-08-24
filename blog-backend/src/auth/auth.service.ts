import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { LoginDto, RegisterDto, RefreshTokenDto } from './dto/auth.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { EmailService } from '../email/email.service';
import bcrypt from 'node_modules/bcryptjs';
import { randomBytes } from 'crypto';

interface JwtPayload {
  email: string;
  sub: number;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) 
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  private generateTokens(user: User) {
    const payload = { email: user.email, sub: user.id, username: user.username };
    
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });
    
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async hashRefreshToken(refreshToken: string): Promise<string> {
    return bcrypt.hash(refreshToken, 10);
  }

  private async verifyRefreshToken(refreshToken: string, hashedToken: string): Promise<boolean> {
    return bcrypt.compare(refreshToken, hashedToken);
  }

  async register(registerDto: RegisterDto) {
    const { username, email, password } = registerDto;

    const existingUser = await this.userRepository.findOne({
        where: [{ username }, { email }],
    });

    if (existingUser) {
        throw new BadRequestException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
        username,
        email,
        password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    const { accessToken, refreshToken } = this.generateTokens(savedUser);
    
    const hashedRefreshToken = await this.hashRefreshToken(refreshToken);
    await this.userRepository.update(savedUser.id, { refreshToken: hashedRefreshToken });

    return {
      accessToken,
      refreshToken,
      user: {
        id: savedUser.id,
        username: savedUser.username,
        email: savedUser.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
   
    const user = await this.userRepository.findOne({
        where: { email },
    });

    if (!user) {
        throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
  
    if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.generateTokens(user);
    
    const hashedRefreshToken = await this.hashRefreshToken(refreshToken);
    await this.userRepository.update(user.id, { refreshToken: hashedRefreshToken });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refreshToken } = refreshTokenDto;

    try {
      const payload: JwtPayload = this.jwtService.verify(refreshToken);
      
      const user = await this.userRepository.findOne({
        where: { id: Number(payload.sub) },
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshTokenValid = await this.verifyRefreshToken(
        refreshToken,
        user.refreshToken,
      );

      if (!isRefreshTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = 
        this.generateTokens(user);

      const hashedNewRefreshToken = await this.hashRefreshToken(newRefreshToken);
      await this.userRepository.update(user.id, { 
        refreshToken: hashedNewRefreshToken 
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
      };
    } catch (error: unknown) {
      if ((error as Error).name === 'TokenExpiredError') {
        throw new UnauthorizedException('Refresh token expired');
      }
      if ((error as Error).name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid refresh token format');
      }
      throw new UnauthorizedException('Invalid refresh token: ' + (error as Error).message);
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;
    
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      return { message: 'If an account with that email exists, a password reset link has been sent.' };
    }

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await this.userRepository.update(user.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpiry,
    });

    await this.emailService.sendPasswordResetEmail(email, resetToken, user.username);

    return { message: 'If an account with that email exists, a password reset link has been sent.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.userRepository.update(user.id, {
      password: hashedPassword,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
    });

    await this.emailService.sendPasswordChangedEmail(user.email, user.username);

    return { message: 'Password has been reset successfully' };
  }

  async logout(userId: number) {
    await this.userRepository.update(userId, { refreshToken: undefined });
    return { message: 'Logged out successfully' };
  }

  async revokeAllTokens(userId: number) {
    await this.userRepository.update(userId, { refreshToken: undefined });
    return { message: 'All tokens revoked successfully' };
  }
}