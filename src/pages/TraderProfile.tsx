import { useParams, Link } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { PegasusAnimation } from '@/components/PegasusAnimation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { getOrderByUsername, getAvatarUrl } from '@/data/otcOrdersList';

const statusColor = (status: string) => {
  if (status === 'active') return 'text-green-500 bg-green-500/10 border-green-500/30';
  if (status === 'pending') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  return 'text-red-500 bg-red-500/10 border-red-500/30';
};

const TraderProfile = () => {
  const { username = '' } = useParams();
  const order = getOrderByUsername(username);

  return (
    <div className="min-h-screen bg-transparent text-foreground overflow-hidden relative">
      <PegasusAnimation />
      <Navigation />
      <main className="container mx-auto px-4 pt-24 pb-12 relative z-10 max-w-2xl">
        <Link to="/otc" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to OTC
        </Link>

        {!order ? (
          <Card className="glass-card border-white/10">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Trader @{username} not found.</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card border-white/10">
              <CardContent className="p-8">
                <div className="flex flex-col items-center text-center">
                  <img
                    src={getAvatarUrl(order.username)}
                    alt={order.username}
                    className="w-28 h-28 rounded-full border-2 border-primary/30 shadow-2xl shadow-primary/20 bg-white/5"
                  />
                  <h1 className="text-2xl font-bold mt-4">@{order.username}</h1>
                  <p className="text-sm text-muted-foreground mt-1">OTC Trader Profile</p>
                </div>

                <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Order Type</div>
                    <div className="flex items-center justify-center gap-2 font-bold">
                      {order.side === 'buy' ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                      <span className={order.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                        {order.side.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Order Amount</div>
                    <div className="font-bold font-mono">${order.amount.toLocaleString()}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <Badge className={`${statusColor(order.status)} border capitalize`}>{order.status}</Badge>
                  </div>
                </div>

                <div className="mt-8 flex justify-center">
                  <Button asChild variant="outline" className="border-white/10">
                    <Link to="/otc">View All OTC Orders</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
};

export default TraderProfile;
