import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { _ } from "@/lib/lodash";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { BlinkoCard } from "@/components/BlinkoCard";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PreviewPdfButton } from "@/components/Common/PreviewPdfButton";

const Detail = observer(() => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);

  useEffect(() => {
    if (searchParams.get('id')) {
      blinko.noteDetail.call({ id: Number(searchParams.get('id')) });
    }
  }, [location.pathname, searchParams.get('id'), blinko.updateTicker, blinko.forceQuery]);

  return (
    <ScrollArea fixMobileTopBar>
      <div className="blinko-preview-page max-w-[800px] mx-auto p-4">
        <div className="blinko-preview-toolbar"><span>Note preview</span><PreviewPdfButton /></div>
        <LoadingAndEmpty
          isLoading={blinko.noteDetail.loading.value}
          isEmpty={!blinko.noteDetail.value}
        />

        {blinko.noteDetail.value && (
          <BlinkoCard
            blinkoItem={blinko.noteDetail.value}
            defaultExpanded={false}
            glassEffect={false}
          />
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;