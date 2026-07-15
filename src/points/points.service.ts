import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  PointTransaction,
  PointTransactionType,
} from './entities/point-transaction.entity';
import {
  RechargeOrder,
  RechargeOrderStatus,
} from './entities/recharge-order.entity';

interface PointChangeOptions {
  type: PointTransactionType;
  amount: number;
  bizType?: string;
  bizId?: string;
  remark?: string;
}

const RECHARGE_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter Pack',
    amountCents: 990,
    points: 100,
    description: 'Suitable for a few AI design trials.',
  },
  {
    id: 'standard',
    name: 'Standard Pack',
    amountCents: 2990,
    points: 330,
    description: 'Most useful for regular customization.',
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    amountCents: 5990,
    points: 700,
    description: 'Better value for frequent AI image generation.',
  },
  {
    id: 'team',
    name: 'Team Pack',
    amountCents: 9900,
    points: 1200,
    description: 'Best for team and batch jersey concepts.',
  },
];

@Injectable()
export class PointsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PointTransaction)
    private readonly transactionsRepository: Repository<PointTransaction>,
    @InjectRepository(RechargeOrder)
    private readonly rechargeOrdersRepository: Repository<RechargeOrder>,
  ) {}

  getRechargePackages() {
    return RECHARGE_PACKAGES.map((item) => ({
      ...item,
      amountYuan: item.amountCents / 100,
    }));
  }

  async getBalance(userId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User does not exist');
    }

    return {
      pointsBalance: user.pointsBalance || 0,
    };
  }

  async listTransactions(userId: number, limit = 30) {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.transactionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
  }

  async createRechargeOrder(userId: number, packageId: string) {
    const rechargePackage = RECHARGE_PACKAGES.find((item) => item.id === packageId);
    if (!rechargePackage) {
      throw new BadRequestException('Recharge package does not exist');
    }

    const orderNo = this.createOrderNo();
    const order = this.rechargeOrdersRepository.create({
      orderNo,
      userId,
      packageId: rechargePackage.id,
      amountCents: rechargePackage.amountCents,
      points: rechargePackage.points,
      status: 'pending',
      payChannel: 'alipay',
      qrContent: `alipay-dev://pay?orderNo=${orderNo}&amount=${(
        rechargePackage.amountCents / 100
      ).toFixed(2)}`,
    });

    await this.rechargeOrdersRepository.save(order);
    return {
      order,
      package: {
        ...rechargePackage,
        amountYuan: rechargePackage.amountCents / 100,
      },
    };
  }

  async getRechargeOrder(userId: number, orderNo: string) {
    const order = await this.rechargeOrdersRepository.findOne({
      where: { userId, orderNo },
    });
    if (!order) {
      throw new BadRequestException('Recharge order does not exist');
    }
    return order;
  }

  async simulatePayRechargeOrder(userId: number, orderNo: string) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(RechargeOrder, {
        where: { userId, orderNo },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new BadRequestException('Recharge order does not exist');
      }

      if (order.status === 'paid') {
        const balance = await this.getBalance(userId);
        return { order, pointsBalance: balance.pointsBalance };
      }

      if (order.status !== 'pending') {
        throw new BadRequestException('Only pending orders can be paid');
      }

      order.status = 'paid' as RechargeOrderStatus;
      order.paidAt = new Date();
      order.alipayTradeNo = `DEV${order.orderNo}`;
      await manager.save(RechargeOrder, order);

      const result = await this.changePointsWithManager(manager, userId, {
        type: 'recharge',
        amount: order.points,
        bizType: 'recharge',
        bizId: order.orderNo,
        remark: `Recharge order ${order.orderNo}`,
      });

      return {
        order,
        pointsBalance: result.pointsBalance,
        transaction: result.transaction,
      };
    });
  }

  async addPoints(userId: number, amount: number, remark = 'Points recharge', bizId?: string) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Recharge points must be greater than 0');
    }

    return this.changePoints(userId, {
      type: 'recharge',
      amount,
      bizType: 'recharge',
      bizId,
      remark,
    });
  }

  async consumePoints(
    userId: number,
    amount: number,
    bizType: string,
    remark?: string,
  ) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Consumed points must be greater than 0');
    }

    return this.changePoints(userId, {
      type: 'ai_consume',
      amount: -amount,
      bizType,
      remark: remark || 'AI feature consumption',
    });
  }

  async refundPoints(userId: number, amount: number, bizType: string, remark?: string) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Refund points must be greater than 0');
    }

    return this.changePoints(userId, {
      type: 'refund',
      amount,
      bizType,
      remark: remark || 'AI feature refund',
    });
  }

  private async changePoints(userId: number, options: PointChangeOptions) {
    return this.dataSource.transaction(async (manager) =>
      this.changePointsWithManager(manager, userId, options),
    );
  }

  private async changePointsWithManager(
    manager,
    userId: number,
    options: PointChangeOptions,
  ) {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new BadRequestException('User does not exist');
    }

    const currentBalance = user.pointsBalance || 0;
    const nextBalance = currentBalance + options.amount;
    if (nextBalance < 0) {
      throw new BadRequestException('Insufficient points, please recharge first');
    }

    user.pointsBalance = nextBalance;
    await manager.save(User, user);

    const transaction = manager.create(PointTransaction, {
      userId,
      type: options.type,
      amount: options.amount,
      balanceAfter: nextBalance,
      bizType: options.bizType,
      bizId: options.bizId,
      remark: options.remark,
    });
    await manager.save(PointTransaction, transaction);

    return {
      pointsBalance: nextBalance,
      transaction,
    };
  }

  private createOrderNo() {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RC${Date.now()}${random}`;
  }
}
