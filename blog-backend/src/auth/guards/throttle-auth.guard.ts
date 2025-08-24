import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { Response } from 'express';

interface RequestWithIp {
  ip: string;
  user?: { id: string | number };
}

@Injectable()
export class AdvancedThrottleAuthGuard extends ThrottlerGuard {
  protected getTracker(req: RequestWithIp): Promise<string> {
    return Promise.resolve(req.ip || req.user?.id?.toString() || 'unknown');
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const request = context.switchToHttp().getRequest<RequestWithIp>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const clientIp = request.ip;
    
    if (this.isBlacklisted(clientIp)) {
      response.status(429).json({
        message: 'Too many requests from this IP',
        retryAfter: ttl,
        limit: limit,
      });
      return false;
    }
    
    return super.handleRequest(requestProps);
  }

  private isBlacklisted(ip: string): boolean {
    const blacklistedIPs = ['192.168.1.100', '10.0.0.50'];
    return blacklistedIPs.includes(ip);
  }
}
