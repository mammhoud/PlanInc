import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { _ } from "@/lib/lodash";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { PlanIncCard } from "@/components/PlanIncCard";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";

const Detail = observer(() => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const planinc = RootStore.Get(PlanIncStore);

  useEffect(() => {
    if (searchParams.get('id')) {
      planinc.noteDetail.call({ id: Number(searchParams.get('id')) });
    }
  }, [location.pathname, searchParams.get('id'), planinc.updateTicker, planinc.forceQuery]);

  return (
    <ScrollArea fixMobileTopBar>
      <div className="max-w-[800px] mx-auto p-4">
        <LoadingAndEmpty
          isLoading={planinc.noteDetail.loading.value}
          isEmpty={!planinc.noteDetail.value}
        />

        {planinc.noteDetail.value && (
          <PlanIncCard
            planincItem={planinc.noteDetail.value}
            defaultExpanded={false}
            glassEffect={false}
          />
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;