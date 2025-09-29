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

    var MIN_SCALE = 0.3;  // 최소 배율
    var MAX_SCALE = 5;    // 최대 배율

    function getClampMode() { return $('#clampMode').val() || 'soft'; }
    function isSnapEnabled() { return $('#snapToggle').is(':checked'); }
    function isGridMoveOn() { return $('#gridToggle').is(':checked'); }

    function sign(v) { return v < 0 ? -1 : 1; }
    /* 부호는 유지하고, 절대값만 [min,max]로 클램프 */
    function clampSigned(v, min, max) {
        var s = sign(v), a = Math.abs(v);
        if (a < min) a = min;
        if (a > max) a = max;
        return s * a;
    }

    /* scaleX/scaleY/rotation을 한 번에 적용 */
    function applyTransform($item) {
        var sx = $item.data('scaleX') || 1;
        var sy = $item.data('scaleY') || 1;
        var rot = $item.data('rotation') || 0; // deg
        $item.css('transform', 'rotate(' + rot + 'deg) scale(' + sx + ',' + sy + ')');
    }


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
            $item.data('scaleX', 1);
            $item.data('scaleY', 1);

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
            if ($(e.target).closest('.selection-handle, .edge-handle, .corner-hit, .selection-rotate-handle').length) return; // ← 핸들이면 이동 안 함

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
                var sx = Math.abs($dragItem.data('scaleX') || 1);
                var sy = Math.abs($dragItem.data('scaleY') || 1);
                var itemW = ICON_SIZE * sx;
                var itemH = ICON_SIZE * sy;
                var maxL = $canvas.width() - itemW;
                var maxT = $canvas.height() - itemH;
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
                var sx = Math.abs($dragItem.data('scaleX') || 1);
                var sy = Math.abs($dragItem.data('scaleY') || 1);
                var itemW = ICON_SIZE * sx;
                var itemH = ICON_SIZE * sy;
                var maxL = $canvas.width() - itemW;
                var maxT = $canvas.height() - itemH;
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

    /** 리사이즈 핸들 드래그로 크기 조정 (중앙 기준 균등 스케일) */
    function bindResizeHandles() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var resizing = false;
        var $item = null;
        var mode = 'uniform';     // 'uniform' | 'x' | 'y'
        var startScaleX = 1, startScaleY = 1;
        var centerX = 0, centerY = 0;
        var r0 = 1, ax0 = 1, ay0 = 1;     // 기준 반경/축거리
        var sgnX0 = 1, sgnY0 = 1;         // 기준 부호(반전 판정)

        // 코너/중점 핸들 + 엣지에서 리사이즈 시작
        $canvas.on('mousedown', '.selection-handle, .edge-handle, .corner-hit', function (e) {
            if (e.which !== 1) return;
            e.stopPropagation();
            e.preventDefault();

            $item = $(this).closest('.canvas-item');
            if ($item.length === 0) return;

            // 선택 보장
            if (!$item.hasClass('is-selected')) {
                clearSelection();
                $item.addClass('is-selected');
                applySelectionOverlay($item);
            }

            // 핸들 종류에 따라 모드 결정
            var h = $(this).attr('data-handle') || '';
            if (h === 'n' || h === 's') mode = 'y';
            else if (h === 'w' || h === 'e') mode = 'x';
            else mode = 'uniform'; // nw/ne/sw/se

            // 시작 배율
            startScaleX = $item.data('scaleX') || 1;
            startScaleY = $item.data('scaleY') || 1;

            // 중심 좌표(페이지)
            var off = $item.offset();
            var w = ICON_SIZE * Math.abs(startScaleX);
            var hgt = ICON_SIZE * Math.abs(startScaleY);
            centerX = off.left + w / 2;
            centerY = off.top + hgt / 2;

            var dx0 = e.clientX - centerX;
            var dy0 = e.clientY - centerY;

            // 기준값/부호 (반전 판정용)
            r0 = Math.max(10, Math.hypot(dx0, dy0));
            ax0 = Math.max(10, Math.abs(dx0));
            ay0 = Math.max(10, Math.abs(dy0));
            sgnX0 = sign(dx0);
            sgnY0 = sign(dy0);

            resizing = true;
            $('body').addClass('no-select');
        });

        // 드래그 중
        $doc.on('mousemove.resize', function (e) {
            if (!resizing || !$item) return;

            var dx = e.clientX - centerX;
            var dy = e.clientY - centerY;

            var sx = startScaleX;
            var sy = startScaleY;

            if (mode === 'uniform') {
                var r1 = Math.max(10, Math.hypot(dx, dy));
                var ratio = r1 / r0;
                var flipX = (dx === 0) ? 1 : (sign(dx) === sgnX0 ? 1 : -1);
                var flipY = (dy === 0) ? 1 : (sign(dy) === sgnY0 ? 1 : -1);
                sx = clampSigned(startScaleX * ratio * flipX, MIN_SCALE, MAX_SCALE);
                sy = clampSigned(startScaleY * ratio * flipY, MIN_SCALE, MAX_SCALE);
            } else if (mode === 'x') {
                var ax1 = Math.max(10, Math.abs(dx));
                var rx = ax1 / ax0;
                var flipX = (dx === 0) ? 1 : (sign(dx) === sgnX0 ? 1 : -1);
                sx = clampSigned(startScaleX * rx * flipX, MIN_SCALE, MAX_SCALE);
                sy = startScaleY;
            } else if (mode === 'y') {
                var ay1 = Math.max(10, Math.abs(dy));
                var ry = ay1 / ay0;
                var flipY = (dy === 0) ? 1 : (sign(dy) === sgnY0 ? 1 : -1);
                sy = clampSigned(startScaleY * ry * flipY, MIN_SCALE, MAX_SCALE);
                sx = startScaleX;
            }

            /*
            // 적용
            $item.css('transform', 'scale(' + sx + ',' + sy + ')');
            $item.data('scaleX', sx);
            $item.data('scaleY', sy);
            */
            $item.data('scaleX', sx);
            $item.data('scaleY', sy);
            applyTransform($item);
        });

        // 리사이즈 종료
        $doc.on('mouseup.resize', function () {
            if (!resizing) return;
            resizing = false;
            $('body').removeClass('no-select');
            $item = null;
        });
    }

    /* 회전 핸들 드래그로 회전 */
    function bindRotateHandle() {
        var $doc = $(document);
        var $canvas = $('#canvas');
        if ($canvas.length === 0) return;

        var rotating = false;
        var $item = null;
        var startRot = 0;
        var centerX = 0, centerY = 0;
        var startAng = 0;

        // 시작
        $canvas.on('mousedown', '.selection-rotate-handle', function (e) {
            if (e.which !== 1) return;
            e.stopPropagation();
            e.preventDefault();

            $item = $(this).closest('.canvas-item');
            if ($item.length === 0) return;

            // 선택 보장
            if (!$item.hasClass('is-selected')) {
                clearSelection();
                $item.addClass('is-selected');
                applySelectionOverlay($item);
            }

            // 중심 좌표(페이지)
            var off = $item.offset();
            var sx = Math.abs($item.data('scaleX') || 1);
            var sy = Math.abs($item.data('scaleY') || 1);
            var w = ICON_SIZE * sx;
            var h = ICON_SIZE * sy;
            centerX = off.left + w / 2;
            centerY = off.top + h / 2;

            startRot = $item.data('rotation') || 0;
            startAng = Math.atan2(e.clientY - centerY, e.clientX - centerX);

            rotating = true;
            $item.addClass('is-rotating');
            $('body').addClass('no-select');
        });

        // 진행
        $doc.on('mousemove.rotate', function (e) {
            if (!rotating || !$item) return;

            var ang = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            var deltaDeg = (ang - startAng) * 180 / Math.PI;
            var newRot = startRot + deltaDeg;

            // Shift: 15도 스냅
            if (e.shiftKey) newRot = Math.round(newRot / 15) * 15;

            $item.data('rotation', newRot);
            applyTransform($item);
        });

        // 종료
        $doc.on('mouseup.rotate', function () {
            if (!rotating) return;
            rotating = false;
            if ($item) $item.removeClass('is-rotating');
            $('body').removeClass('no-select');
            $item = null;
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

        var EH = 12; // edge hit thickness
        var edges = [
            { x: x, y: y, w: w, h: EH, tag: 'n' }, // 상
            { x: x + w - EH, y: y, w: EH, h: h, tag: 'e' }, // 우
            { x: x, y: y + h - EH, w: w, h: EH, tag: 's' }, // 하
            { x: x, y: y, w: EH, h: h, tag: 'w' }  // 좌
        ];
        for (var ei = 0; ei < edges.length; ei++) {
            var eh = document.createElementNS(svgns, 'rect');
            eh.setAttribute('x', edges[ei].x);
            eh.setAttribute('y', edges[ei].y);
            eh.setAttribute('width', edges[ei].w);
            eh.setAttribute('height', edges[ei].h);
            eh.setAttribute('class', 'edge-handle');
            eh.setAttribute('data-handle', edges[ei].tag);
            overlay.appendChild(eh);
        }

        // 회전 핸들(상단 중앙에서 위로 살짝 떨어진 곳)
        var RH_R = 7;    // 회전 핸들 반지름
        var RH_GAP = 18; // 상단 테두리에서 위로 띄울 거리
        var cx = x + w / 2;
        var cy = y - RH_GAP;

        // 연결선
        var rLine = document.createElementNS(svgns, 'line');
        rLine.setAttribute('x1', cx);
        rLine.setAttribute('y1', y);
        rLine.setAttribute('x2', cx);
        rLine.setAttribute('y2', cy);
        rLine.setAttribute('class', 'selection-rotate-line');
        overlay.appendChild(rLine);

        // 원형 핸들
        var rHandle = document.createElementNS(svgns, 'circle');
        rHandle.setAttribute('cx', cx);
        rHandle.setAttribute('cy', cy);
        rHandle.setAttribute('r', RH_R);
        rHandle.setAttribute('class', 'selection-rotate-handle');
        rHandle.setAttribute('data-handle', 'rotate');
        overlay.appendChild(rHandle);

        var CH = 18; // corner hit size (px, SVG 좌표계)
        var corners = [
            { cx: x, cy: y, tag: 'nw' },
            { cx: x + w, cy: y, tag: 'ne' },
            { cx: x, cy: y + h, tag: 'sw' },
            { cx: x + w, cy: y + h, tag: 'se' }
        ];
        for (var ci = 0; ci < corners.length; ci++) {
            var ch = document.createElementNS(svgns, 'rect');
            ch.setAttribute('x', corners[ci].cx - CH / 2);
            ch.setAttribute('y', corners[ci].cy - CH / 2);
            ch.setAttribute('width', CH);
            ch.setAttribute('height', CH);
            ch.setAttribute('class', 'corner-hit');
            ch.setAttribute('data-handle', corners[ci].tag);
            overlay.appendChild(ch);
        }

        // 8개 핸들(모양만, 동작 미구현 → 이번 단계에서 드래그로 크기조정)
        var pts = [
            [x, y], [x + w / 2, y], [x + w, y],
            [x, y + h / 2], [x + w, y + h / 2],
            [x, y + h], [x + w / 2, y + h], [x + w, y + h]
        ];
        var tags = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];

        for (var i = 0; i < pts.length; i++) {
            var r = document.createElementNS(svgns, 'rect');
            var size = 8;
            r.setAttribute('x', pts[i][0] - size / 2);
            r.setAttribute('y', pts[i][1] - size / 2);
            r.setAttribute('width', size);
            r.setAttribute('height', size);
            r.setAttribute('class', 'selection-handle');
            r.setAttribute('data-handle', tags[i]); // ← 커서/동작용 태그
            overlay.appendChild(r);
        }
        /*
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
        */
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
        bindResizeHandles(); // ← 리사이즈 핸들 활성화
        bindRotateHandle();
    }
    appInit();
});