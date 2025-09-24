// 페이지 로드 시 실행
$(document).ready(function () {
    // 메뉴 아이콘 초기화 (jQuery 사용)
    function initMenuIcons() {
        try {
            var $grid = $('#menuGrid');
            if ($grid.length === 0) return;

            var count = 10; // 아이콘 개수
            for (var i = 1; i <= count; i++) {
                var idx = ('0' + i).slice(-2); // 01, 02 ...
                var $img = $('<img>', {
                    src: 'images/menu' + idx + '.svg',
                    alt: '메뉴 ' + i,
                    tabindex: 0
                });
                $grid.append($img);
            }
        } catch (e) {
            console.error('menuGrid 초기화 오류', e);
        }
    }

    /** 우측 상단 레이어 UI 초기화 (jQuery) */
    function initLayerUI(layers) {
        try {
            var $select = $('#layerSelect');
            var $title = $('#layerTitle');
            var $desc = $('#layerDesc');

            if ($select.length === 0 || $title.length === 0 || $desc.length === 0) {
                console.warn('initLayerUI: 필수 엘리먼트가 없습니다.');
                return;
            }

            // 기존 placeholder 유지 + 레이어 옵션 추가
            for (var i = 0; i < layers.length; i++) {
                var item = layers[i];
                var $opt = $('<option>', {
                    value: item.id,
                    text: item.name
                }).attr('data-desc', item.desc);
                $select.append($opt);
            }

            // 선택 시 좌측 정보 갱신
            $select.on('change', function () {
                updateLayerInfo($select, $title, $desc);
            });

            // + 버튼(미구현): 추후 팝업 연결 예정
            $('#addLayerBtn').on('click', function () {
                // TODO: 요청 시 레이어 추가 팝업 구현
            });
        } catch (e) {
            console.error('initLayerUI 오류', e);
        }
    }

    /** 셀렉트에서 선택된 옵션으로 타이틀/설명 표시 (jQuery) */
    function updateLayerInfo($select, $titleEl, $descEl) {
        var val = $select.val();
        if (!val) {
            $titleEl.text('선택된 레이어 없음');
            $descEl.text('우측 상단에서 레이어를 선택하세요.');
            return;
        }
        var $opt = $select.find('option:selected');
        $titleEl.text($opt.text());
        $descEl.text($opt.data('desc') || '');
    }

    function getDefaultLayers() {
        return [
            { id: 'L001', name: '기본 레이어', desc: '프로그램 기본 레이어' },
            { id: 'L002', name: '자산 현황', desc: '자산 목록/상태 표시' },
            { id: 'L003', name: '점검 레이어', desc: '점검 체크 및 리포트' }
        ];
    }

    /** 앱 초기화(명시적 함수명) */
    function appInit() {
        initMenuIcons();
        initLayerUI(getDefaultLayers());   // 우측 레이어 UI 초기화
    }


    appInit();
});