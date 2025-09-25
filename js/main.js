// 페이지 로드 시 실행
$(document).ready(function () {
    // === 상단 상수 (여기서만 값 조정) ===
    var ICON_SIZE = 64;   // 드롭 아이콘 표준 뷰포트(px)
    var ICON_PAD = 6;    // 테두리와 콘텐츠 사이 여백(px)
    var GRID_SIZE = 20;   // 그리드 간격(px)
    var SNAP_THRESHOLD = 6;    // 스냅 허용 오차(px)
    var CLAMP_DEFAULT = 'soft';   // 'soft' | 'hard' | 'none'
    var SNAP_DEFAULT = false;    // 초기 스냅 체크 여부
    var GRID_MOVE_DEFAULT = false;  // 초기 그리드이동 체크 여부
    var SVG_NS = 'http://www.w3.org/2000/svg';

    // 그리드/스냅 설정 (배경 그리드 20px과 일치)
    var GRID_SIZE = 20;
    var SNAP_THRESHOLD = 6; // px, 그리드선과 이만큼 이내면 스냅

    function getClampMode() { return $('#clampMode').val() || 'soft'; }
    function isSnapEnabled() { return $('#snapToggle').is(':checked'); }
    function isGridMoveOn() { return $('#gridToggle').is(':checked'); }

    // 메뉴 아이콘 초기화 (jQuery 사용)
    function initMenuIcons(count) {
        try {
            var $grid = $('#menuGrid');
            if ($grid.length === 0) return;

            // var count = 10; // 아이콘 개수
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

    /** 상단 이동 옵션 컨트롤에 상단 상수의 기본값 적용 */
    function initMoveOptionDefaults() {
        $('#clampMode').val(CLAMP_DEFAULT);
        $('#snapToggle').prop('checked', SNAP_DEFAULT);
        '#gridToggle'
        $('#gridToggle').prop('checked', GRID_MOVE_DEFAULT);
    }

    /** 좌측 SVG 아이콘을 드래그 가능하게 준비 */
    function bindMenuIconDrag() {
        var $imgs = $('.menu-grid img');
        $imgs.attr('draggable', true);
        $imgs.on('dragstart', function (e) {
            var src = this.getAttribute('src');
            // 드롭 시 참조할 데이터 저장
            e.originalEvent.dataTransfer.setData('text/plain', src);
            // 미리보기 이미지(옵션)
            e.originalEvent.dataTransfer.effectAllowed = 'copy';
        });
    }

    /** 드롭 대상 캔버스 바인딩 */
    function bindCanvasDnd() {
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        $canvas.on('dragover', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
        });

        $canvas.on('drop', function (e) {
            e.preventDefault();
            var src = e.originalEvent.dataTransfer.getData('text/plain');
            if (!src) return;

            var offset = $canvas.offset();
            var x = e.originalEvent.clientX - offset.left;
            var y = e.originalEvent.clientY - offset.top;

            addIconToCanvas(src, x, y);
        });
    }

    /** SVG 파일을 inline <svg> 로드 (DOMParser로 SVG 네임스페이스 유지) */
    function loadInlineSvg(url) {
        return $.get(url, null, null, 'text').then(function (data) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(data, 'image/svg+xml');

            // 최상위 <svg> 선택
            var svg = (doc.documentElement && doc.documentElement.nodeName.toLowerCase() === 'svg')
                ? doc.documentElement
                : doc.querySelector('svg');

            if (!svg) throw new Error('SVG 파싱 실패: ' + url);

            // 현재 문서로 가져오기(네임스페이스/메서드 보존)
            var adopted = document.importNode(svg, true);
            return $(adopted);
        });
    }


    /**
 * SVG 콘텐츠를 표준 뷰포트(ICON_SIZE) 안에 ICON_PAD 여백을 두고
 * 중앙 정렬/등비 스케일로 맞춘다.
 * - 기존 내부 여백(viewBox 차이)로 인한 크기 들쭉날쭉을 해소
 */
    function normalizeSvg($svg) {
        try {
            // 1) 표준 뷰포트/패딩
            $svg
                .attr({
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                    viewBox: '0 0 ' + ICON_SIZE + ' ' + ICON_SIZE,
                    preserveAspectRatio: 'xMidYMid meet'
                })
                .css('overflow', 'visible');

            // 2) 같은 문서의 SVG 네임스페이스로 래퍼 생성
            var svgEl = $svg[0];
            var doc = svgEl.ownerDocument;
            var wrap = $svg.find('g.icon-root').get(0);
            if (!wrap) {
                wrap = doc.createElementNS(SVG_NS, 'g');
                wrap.setAttribute('class', 'icon-root');

                // defs/title/metadata/desc 제외하고 요소 자식만 이동 (텍스트/주석 제외)
                var node = svgEl.firstChild;
                var toMove = [];
                while (node) {
                    var next = node.nextSibling;
                    if (node.nodeType === 1) { // ELEMENT_NODE
                        var tag = (node.tagName || '').toLowerCase();
                        if (tag !== 'defs' && tag !== 'title' && tag !== 'metadata' && tag !== 'desc') {
                            toMove.push(node);
                        }
                    }
                    node = next;
                }
                for (var i = 0; i < toMove.length; i++) {
                    wrap.appendChild(toMove[i]); // 같은 문서/NS → OK
                }
                svgEl.appendChild(wrap);
            }

            // 3) bbox 계산 (필요시 폴백)
            var bbox;
            try {
                bbox = wrap.getBBox();
            } catch (err) {
                var shapes = $svg.find('path,rect,circle,ellipse,line,polyline,polygon,g,use').get();
                var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (var j = 0; j < shapes.length; j++) {
                    var el = shapes[j];
                    if (typeof el.getBBox !== 'function') continue;
                    var b = el.getBBox();
                    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height)) continue;
                    minX = Math.min(minX, b.x);
                    minY = Math.min(minY, b.y);
                    maxX = Math.max(maxX, b.x + b.width);
                    maxY = Math.max(maxY, b.y + b.height);
                }
                if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
                    bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
                } else {
                    bbox = { x: 0, y: 0, width: ICON_SIZE, height: ICON_SIZE };
                }
            }

            // 4) ICON_PAD 여백으로 등비 스케일 + 중앙 정렬
            var inner = ICON_SIZE - ICON_PAD * 2;
            var bw = bbox.width || 1;
            var bh = bbox.height || 1;
            var s = Math.min(inner / bw, inner / bh);
            var tx = (ICON_SIZE - bw * s) / 2 - bbox.x * s;
            var ty = (ICON_SIZE - bh * s) / 2 - bbox.y * s;

            wrap.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + s + ')');
        } catch (e) {
            console.warn('normalizeSvg 실패(무시 가능):', e);
        }
    }


    /** 캔버스에 아이콘 추가 */
    function addIconToCanvas(src, x, y) {
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        loadInlineSvg(src).then(function ($svg) {
            // 아이템 컨테이너 생성
            var id = 'item_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            var $item = $('<div>', { class: 'canvas-item', 'data-id': id });

            // 초기 크기(64x64) 설정
            $svg.attr({ width: 64, height: 64 });

            // 캔버스에 추가
            $item.append($svg);
            $canvas.append($item);

            normalizeSvg($svg); // ← 아이콘을 64×64 + 여백으로 표준화

            // 위치(아이콘 중앙이 드롭지점에 오도록 -32 보정)
            $item.css({ left: (x - 32) + 'px', top: (y - 32) + 'px' });
            // 기존 선택 해제
            $('.canvas-item.is-selected').removeClass('is-selected')
                .each(function () { removeSelectionOverlay($(this)); });

            // 방금 추가한 아이템에 즉시 사각 테두리 표시
            $item.addClass('is-selected');
            applySelectionOverlay($item);

            /*
            // 클릭 시 선택 처리
            $item.on('mousedown', function (e) {
                // 다른 선택 해제
                $('.canvas-item.is-selected').removeClass('is-selected')
                    .each(function () { removeSelectionOverlay($(this)); });

                $(this).addClass('is-selected');
                applySelectionOverlay($(this));
                e.stopPropagation();
            });

            // 캔버스 빈 곳 클릭 시 선택 해제
            $('#canvas').off('mousedown.canvasClear').on('mousedown.canvasClear', function () {
                $('.canvas-item.is-selected').removeClass('is-selected')
                    .each(function () { removeSelectionOverlay($(this)); });
            });
            */
        }).catch(function (err) {
            console.error(err);
        });
    }

    /** 공통: 선택 해제 */
    function clearSelection() {
        $('.canvas-item.is-selected').removeClass('is-selected')
            .each(function () { removeSelectionOverlay($(this)); });
    }

    /** 전역 위임: 아이콘 드래그 이동 */
    function bindCanvasItemMove() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var dragging = false;
        var $dragItem = null;
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;

        // 빈 공간 클릭 시 선택 해제
        $canvas.on('mousedown', function (e) {
            if ($(e.target).closest('.canvas-item').length) return; // 아이템이면 패스
            clearSelection();
        });

        // 아이템 클릭(왼쪽 버튼) → 선택 + 드래그 시작
        $canvas.on('mousedown', '.canvas-item', function (e) {
            if (e.which !== 1) return; // 좌클릭만
            $dragItem = $(this);

            // 선택 상태 보장 (드롭 즉시 선택 로직과 충돌 없음)
            if (!$dragItem.hasClass('is-selected')) {
                clearSelection();
                $dragItem.addClass('is-selected');
                applySelectionOverlay($dragItem);
            }

            // 드래그 시작 지점 기록
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseFloat($dragItem.css('left')) || 0;
            startTop = parseFloat($dragItem.css('top')) || 0;
            $dragItem.addClass('is-dragging');

            // 텍스트 선택/네이티브 드래그 방지
            $('body').addClass('no-select');
            e.preventDefault();
        });

        // 이동
        $doc.on('mousemove.canvasDrag', function (e) {
            if (!dragging || !$dragItem) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            var newLeft = startLeft + dx;
            var newTop = startTop + dy;

            // 하드 클램프: 이동 중 즉시 경계 제한
            if (getClampMode() === 'hard') {
                var maxL = $canvas.width() - $dragItem.outerWidth();
                var maxT = $canvas.height() - $dragItem.outerHeight();
                newLeft = Math.max(0, Math.min(newLeft, maxL));
                newTop = Math.max(0, Math.min(newTop, maxT));
            }

            // 그리드 이동(우선 적용) 또는 스냅(보조)
            if (isGridMoveOn()) {
                newLeft = Math.round(newLeft / GRID_SIZE) * GRID_SIZE;
                newTop = Math.round(newTop / GRID_SIZE) * GRID_SIZE;
            } else if (isSnapEnabled()) {
                var snapL = Math.round(newLeft / GRID_SIZE) * GRID_SIZE;
                var snapT = Math.round(newTop / GRID_SIZE) * GRID_SIZE;
                if (Math.abs(snapL - newLeft) <= SNAP_THRESHOLD) newLeft = snapL;
                if (Math.abs(snapT - newTop) <= SNAP_THRESHOLD) newTop = snapT;
            }
            // 필요시 경계 클램프 로직 추가 가능(현재는 자유 이동)
            $dragItem.css({ left: newLeft + 'px', top: newTop + 'px' });
        });

        // 종료
        $doc.on('mouseup.canvasDrag', function () {
            if (!dragging) return;

            // 소프트 클램프: 드롭 후 안쪽으로 스냅백 애니메이션
            if ($dragItem && getClampMode() === 'soft') {
                var maxL = $canvas.width() - $dragItem.outerWidth();
                var maxT = $canvas.height() - $dragItem.outerHeight();
                var curL = parseFloat($dragItem.css('left')) || 0;
                var curT = parseFloat($dragItem.css('top')) || 0;

                var targetL = Math.max(0, Math.min(curL, maxL));
                var targetT = Math.max(0, Math.min(curT, maxT));

                // 그리드 이동이 켜져 있으면 최종 위치도 그리드에 스냅
                if (isGridMoveOn()) {
                    targetL = Math.round(targetL / GRID_SIZE) * GRID_SIZE;
                    targetT = Math.round(targetT / GRID_SIZE) * GRID_SIZE;
                } else if (isSnapEnabled()) {
                    var sL = Math.round(targetL / GRID_SIZE) * GRID_SIZE;
                    var sT = Math.round(targetT / GRID_SIZE) * GRID_SIZE;
                    if (Math.abs(sL - targetL) <= SNAP_THRESHOLD) targetL = sL;
                    if (Math.abs(sT - targetT) <= SNAP_THRESHOLD) targetT = sT;
                }

                $dragItem.stop(true).animate({ left: targetL, top: targetT }, 120);
            }
            dragging = false;
            if ($dragItem) { $dragItem.removeClass('is-dragging'); }
            $('body').removeClass('no-select');
            $dragItem = null;
        });

        // 네이티브 드래그 이미지 방지
        $canvas.on('dragstart', '.canvas-item, .canvas-item *', function (e) {
            e.preventDefault();
        });
    }


    /** 선택된 아이템에 '아이콘 모양 그대로' 윤곽선 + 핸들 생성 */
    /** 선택된 아이템에 '사각 테두리 + 핸들' 생성 (아이콘 활성화 효과 없음) */
    /** 선택된 아이템에 '표준 뷰포트 기준 사각 테두리 + 핸들' 생성 */
    function applySelectionOverlay($item) {
        var $svg = $item.find('svg').first();
        if ($svg.length === 0) return;

        removeSelectionOverlay($item); // 중복 제거

        var svgEl = $svg.get(0);
        var svgns = 'http://www.w3.org/2000/svg';

        // 표준 좌표(0..ICON_SIZE)를 기준으로 사각형/핸들 생성
        var pad = ICON_PAD;
        var x = pad, y = pad;
        var w = ICON_SIZE - pad * 2;
        var h = ICON_SIZE - pad * 2;

        var overlay = document.createElementNS(svgns, 'g');
        overlay.setAttribute('class', 'selection-overlay');

        var rect = document.createElementNS(svgns, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('class', 'selection-rect');
        overlay.appendChild(rect);

        // 8개 핸들(모양만, 동작 미구현)
        var pts = [
            [x, y], [x + w / 2, y], [x + w, y],
            [x, y + h / 2], [x + w, y + h / 2],
            [x, y + h], [x + w / 2, y + h], [x + w, y + h]
        ];
        for (var i = 0; i < pts.length; i++) {
            var r = document.createElementNS(svgns, 'rect');
            var size = 8;
            r.setAttribute('x', pts[i][0] - size / 2);
            r.setAttribute('y', pts[i][1] - size / 2);
            r.setAttribute('width', size);
            r.setAttribute('height', size);
            r.setAttribute('class', 'selection-handle');
            overlay.appendChild(r);
        }

        svgEl.appendChild(overlay);
    }


    /** 선택 오버레이 제거 */
    function removeSelectionOverlay($item) {
        var $svg = $item.find('svg').first();
        if ($svg.length === 0) return;
        $svg.find('g.selection-overlay').remove();
    }


    /** 앱 초기화(명시적 함수명) */
    function appInit() {
        initMenuIcons(10);
        initLayerUI(getDefaultLayers());   // 우측 레이어 UI 초기화

        bindMenuIconDrag();
        bindCanvasDnd();

        bindCanvasItemMove();
        // 이동 옵션 UI에 상단 상수 기본값 반영
        initMoveOptionDefaults();   
    }
    appInit();
});