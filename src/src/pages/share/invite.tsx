import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button } from "@heroui/react";
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from "react-i18next";
import { GradientBackground } from '@/components/Common/GradientBackground';
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { UserStore } from "@/store/user";
import { PromiseState } from "@/store/standard/PromiseState";

/** Email share invite: /share/invite/:token — accepts once the user is signed in. */
const InvitePage: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams();
  const user = RootStore.Get(UserStore);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const store = RootStore.Local(() => ({
    accept: new PromiseState({
      function: async (inviteToken: string) => {
        const row = await api.shareApprovals.acceptInvite.mutate({ token: inviteToken });
        setDone(true);
        setMessage(t('share-invite-accepted') || 'Invitation accepted');
        return row;
      }
    })
  }));

  useEffect(() => {
    if (!token || !user.id) return;
    store.accept.call(token).catch((error: unknown) => {
      setMessage((error as Error)?.message || t('operation-failed'));
    });
  }, [token, user.id]);

  if (!user.id) {
    return (
      <GradientBackground>
        <div className='p-4 h-[100vh] w-full flex justify-center items-center'>
          <Card className="p-6 flex flex-col gap-4 items-center glass-effect">
            <Icon icon="solar:login-bold" className="text-2xl text-primary" />
            <span className="text-xl font-medium">{t('sign-in')}</span>
            <Button color="primary" onPress={() => navigate(`/signin?redirect=${encodeURIComponent(location.pathname)}`)}>
              {t('sign-in')}
            </Button>
          </Card>
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <div className='p-4 h-[100vh] w-full flex justify-center items-center'>
        <Card className="p-6 flex flex-col gap-4 items-center glass-effect min-w-[280px]">
          {store.accept.isLoading ? (
            <Icon icon="svg-spinners:ring-resize" className="text-2xl text-primary" />
          ) : done ? (
            <Icon icon="solar:check-circle-bold" className="text-2xl text-success" />
          ) : (
            <Icon icon="solar:envelope-bold" className="text-2xl text-primary" />
          )}
          {message && <span className="text-sm text-center">{message}</span>}
          <Button color="primary" onPress={() => navigate('/?path=agenda')}>
            {t('back-to-home')}
          </Button>
        </Card>
      </div>
    </GradientBackground>
  );
});

export default InvitePage;
