import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';

export type GenderCheck = 'female' | 'other' | 'missing';

export interface KakaoIdentity {
  kakaoId: string;
  gender: GenderCheck;
}

/**
 * 카카오 OAuth. 토큰은 사용자 정보 조회에만 쓰고 저장하지 않는다.
 * 성별 값은 "카카오 계정에 등록된 성별 정보"일 뿐 신원 인증이 아니다.
 */
@Injectable()
export class KakaoClient {
  private readonly log = new Logger('Kakao');

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  authorizeUrl(state: string, requestGenderConsent: boolean): string {
    const p = new URLSearchParams({
      client_id: this.cfg.kakao.restApiKey,
      redirect_uri: this.cfg.kakao.redirectUri,
      response_type: 'code',
      state,
    });
    // 성별 제공에 동의하지 않았던 사용자에게 추가 동의를 다시 요청
    if (requestGenderConsent) p.set('scope', 'gender');
    return `https://kauth.kakao.com/oauth/authorize?${p}`;
  }

  async identify(code: string): Promise<KakaoIdentity> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.kakao.restApiKey,
      redirect_uri: this.cfg.kakao.redirectUri,
      code,
    });
    if (this.cfg.kakao.clientSecret) body.set('client_secret', this.cfg.kakao.clientSecret);

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) throw new Error(`kakao token ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!meRes.ok) throw new Error(`kakao user/me ${meRes.status}`);
    const me = (await meRes.json()) as {
      id: number;
      kakao_account?: { has_gender?: boolean; gender_needs_agreement?: boolean; gender?: string };
    };
    const account = me.kakao_account ?? {};
    let gender: GenderCheck = 'missing';
    if (account.gender === 'female') gender = 'female';
    else if (account.gender) gender = 'other';
    return { kakaoId: String(me.id), gender };
  }

  /** 앱 연결 해제(탈퇴). 저장된 토큰이 없으므로 Admin 키로 처리한다. */
  async unlink(kakaoId: string): Promise<boolean> {
    if (!this.cfg.kakao.adminKey) {
      this.log.warn('KAKAO_ADMIN_KEY 미설정: 카카오 연결 해제를 건너뜀');
      return false;
    }
    try {
      const res = await fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST',
        headers: {
          Authorization: `KakaoAK ${this.cfg.kakao.adminKey}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body: new URLSearchParams({ target_id_type: 'user_id', target_id: kakaoId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) this.log.warn(`카카오 연결 해제 실패 status=${res.status}`);
      return res.ok;
    } catch (e) {
      this.log.warn(`카카오 연결 해제 요청 오류: ${(e as Error).message}`);
      return false;
    }
  }
}
